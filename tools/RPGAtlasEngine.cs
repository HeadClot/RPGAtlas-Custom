/* RPGAtlas engine launcher. GPL-3.0-or-later (see LICENSE).

   Double-clicking RPGAtlas.exe starts the editor and opens it in the default
   browser. Two modes, picked automatically so it "just works" for both
   developers and players who received a copy without any tools installed:

   * Developer mode — when node_modules\vite is present, boot the Vite dev
     server. Since the Phase 1 module build, the SOURCE index.html loads the
     editor as <script type="module" src="/src/editor/main.ts">, raw
     TypeScript only Vite can transpile. Browser opening is delegated to
     Vite's --open flag (opens exactly when the server is ready; a hand-
     rolled TCP probe here previously mishandled IPv6 localhost and delayed
     the browser by up to a minute). --clearScreen false keeps the RPGAtlas
     banner visible above Vite's output.

   * Standalone mode — no node_modules needed. Serve the pre-built frontend
     (dist\ next to the exe, or the exe's own folder when it sits inside a
     built copy) with a tiny HttpListener static server. The build output is
     plain JS/CSS, so no toolchain is required. A real HTTP origin is still
     needed because localStorage/autosave is blocked on file:// pages, and
     custom-asset discovery does fetch("img/<type>/") and parses a
     python-style directory listing (see js/assets.js), which this server
     provides. HttpListener loopback prefixes are exempt from the Windows
     URL-ACL requirement, so no admin rights either. */
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

internal static class RPGAtlasEngine
{
    private const int FirstPort = 8080;
    private const int LastPort = 8099;

    private static readonly Dictionary<string, string> MimeTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".htm",  "text/html; charset=utf-8" },
        { ".js",   "text/javascript; charset=utf-8" },
        { ".mjs",  "text/javascript; charset=utf-8" },
        { ".css",  "text/css; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".svg",  "image/svg+xml" },
        { ".png",  "image/png" },
        { ".webp", "image/webp" },
        { ".jpg",  "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".gif",  "image/gif" },
        { ".ico",  "image/x-icon" },
        { ".wav",  "audio/wav" },
        { ".ogg",  "audio/ogg" },
        { ".mp3",  "audio/mpeg" },
        { ".txt",  "text/plain; charset=utf-8" },
        { ".md",   "text/plain; charset=utf-8" },
        { ".map",  "application/json; charset=utf-8" },
        { ".exe",  "application/octet-stream" },
    };

    private static string _staticRoot;

    private static int Main(string[] args)
    {
        Console.Title = "RPGAtlas";
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        bool openBrowser = Array.IndexOf(args, "--no-browser") < 0;

        string viteScript = Path.Combine(root, "node_modules", "vite", "bin", "vite.js");
        if (File.Exists(viteScript) && File.Exists(Path.Combine(root, "index.html")))
            return RunViteDev(root, viteScript, openBrowser);

        string staticRoot = FindStaticRoot(root);
        if (staticRoot != null)
            return RunStaticServer(staticRoot, openBrowser);

        if (File.Exists(Path.Combine(root, "index.html")))
        {
            return Fail(
                "RPGAtlas needs its one-time setup first.",
                "Open a terminal in the RPGAtlas folder and run:  npm install");
        }
        return Fail(
            "RPGAtlas could not find the editor files next to this program.",
            "Keep RPGAtlas.exe inside the RPGAtlas folder, then run it again.");
    }

    /* -------------------- developer mode (Vite) -------------------- */

    private static int RunViteDev(string root, string viteScript, bool openBrowser)
    {
        int port = FindFreePort();
        if (port == 0) return FailPortsBusy();

        PrintBanner(port, "starting");

        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = "node";
        startInfo.Arguments = "\"" + viteScript + "\" --port " + port + " --strictPort --clearScreen false"
            + (openBrowser ? " --open" : "");
        startInfo.WorkingDirectory = root;
        startInfo.UseShellExecute = false;

        Process vite;
        try
        {
            vite = Process.Start(startInfo);
        }
        catch (Exception)
        {
            return Fail(
                "RPGAtlas could not start Node.js (is it installed?).",
                "Install Node.js 18 or newer from https://nodejs.org/ and try again.");
        }

        // Vite shares this console, so closing the window shuts both down.
        vite.WaitForExit();

        if (vite.ExitCode != 0)
        {
            return Fail(
                "RPGAtlas stopped because of an error (see the messages above).",
                "If you are stuck, ask for help and share a photo of this window.");
        }
        return 0;
    }

    /* -------------------- standalone mode (built copy) -------------------- */

    // A built frontend is self-contained: its index.html references the
    // bundled ./assets/ chunk instead of the raw /src/editor/main.ts entry.
    private static string FindStaticRoot(string root)
    {
        string distIndex = Path.Combine(root, "dist", "index.html");
        if (File.Exists(distIndex)) return Path.Combine(root, "dist");

        string ownIndex = Path.Combine(root, "index.html");
        if (File.Exists(ownIndex) && !File.ReadAllText(ownIndex).Contains("/src/editor/main.ts"))
            return root;

        return null;
    }

    private static int RunStaticServer(string staticRoot, bool openBrowser)
    {
        _staticRoot = staticRoot;

        HttpListener listener = null;
        int port = 0;
        for (int candidate = FirstPort; candidate <= LastPort; candidate++)
        {
            try
            {
                HttpListener attempt = new HttpListener();
                attempt.Prefixes.Add("http://localhost:" + candidate + "/");
                attempt.Start();
                listener = attempt;
                port = candidate;
                break;
            }
            catch (HttpListenerException) { /* port busy — try the next one */ }
        }
        if (listener == null) return FailPortsBusy();

        PrintBanner(port, "running");

        string url = "http://localhost:" + port + "/";
        if (openBrowser)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { Console.WriteLine("  (Open " + url + " in your browser to begin.)"); }
        }

        while (listener.IsListening)
        {
            HttpListenerContext context;
            try { context = listener.GetContext(); }
            catch { break; }
            ThreadPool.QueueUserWorkItem(delegate { Handle(context); });
        }
        return 0;
    }

    private static void Handle(HttpListenerContext context)
    {
        try
        {
            string relative = Uri.UnescapeDataString(context.Request.Url.AbsolutePath).TrimStart('/');
            string fullPath = Path.GetFullPath(Path.Combine(_staticRoot, relative.Replace('/', Path.DirectorySeparatorChar)));

            // Refuse anything that escapes the served folder.
            if (!fullPath.StartsWith(_staticRoot, StringComparison.OrdinalIgnoreCase))
            {
                WriteStatus(context, 403, "Forbidden");
                return;
            }

            if (Directory.Exists(fullPath))
            {
                string indexFile = Path.Combine(fullPath, "index.html");
                if (File.Exists(indexFile) && relative.Length == 0)
                {
                    ServeFile(context, indexFile);
                    return;
                }
                ServeDirectoryListing(context, fullPath);
                return;
            }

            if (File.Exists(fullPath))
            {
                ServeFile(context, fullPath);
                return;
            }

            WriteStatus(context, 404, "Not found");
        }
        catch
        {
            try { WriteStatus(context, 500, "Server error"); } catch { }
        }
    }

    private static void ServeFile(HttpListenerContext context, string path)
    {
        string ext = Path.GetExtension(path);
        string mime;
        if (!MimeTypes.TryGetValue(ext, out mime)) mime = "application/octet-stream";
        context.Response.ContentType = mime;
        context.Response.Headers["Cache-Control"] = "no-store";

        byte[] body = File.ReadAllBytes(path);
        context.Response.ContentLength64 = body.Length;
        context.Response.OutputStream.Write(body, 0, body.Length);
        context.Response.OutputStream.Close();
    }

    // Python-style directory listing: js/assets.js scans these <a href> links
    // to discover custom characters/facesets/enemies/tilesets.
    private static void ServeDirectoryListing(HttpListenerContext context, string directory)
    {
        StringBuilder html = new StringBuilder();
        html.Append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>RPGAtlas</title></head><body><ul>");

        foreach (string dir in Directory.GetDirectories(directory))
        {
            string name = Path.GetFileName(dir);
            html.Append("<li><a href=\"" + Encode(name) + "/\">" + Encode(name) + "/</a></li>");
        }
        foreach (string file in Directory.GetFiles(directory))
        {
            string name = Path.GetFileName(file);
            html.Append("<li><a href=\"" + Encode(name) + "\">" + Encode(name) + "</a></li>");
        }
        html.Append("</ul></body></html>");

        byte[] body = Encoding.UTF8.GetBytes(html.ToString());
        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.ContentLength64 = body.Length;
        context.Response.OutputStream.Write(body, 0, body.Length);
        context.Response.OutputStream.Close();
    }

    private static void WriteStatus(HttpListenerContext context, int code, string message)
    {
        context.Response.StatusCode = code;
        byte[] body = Encoding.UTF8.GetBytes(message);
        context.Response.ContentType = "text/plain; charset=utf-8";
        context.Response.ContentLength64 = body.Length;
        context.Response.OutputStream.Write(body, 0, body.Length);
        context.Response.OutputStream.Close();
    }

    private static string Encode(string value)
    {
        return value
            .Replace("&", "&amp;")
            .Replace("\"", "&quot;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;");
    }

    /* -------------------- shared helpers -------------------- */

    private static void PrintBanner(int port, string verb)
    {
        string url = "http://localhost:" + port + "/";
        Console.WriteLine();
        Console.WriteLine("  RPGAtlas is " + verb + "...");
        Console.WriteLine();
        Console.WriteLine("  Editor:  " + url);
        Console.WriteLine("  Player:  " + url + "play.html");
        Console.WriteLine();
        Console.WriteLine("  Your browser will open by itself in a moment.");
        Console.WriteLine("  Keep this window open while you work. Close it to stop RPGAtlas.");
        Console.WriteLine();
    }

    private static int FindFreePort()
    {
        for (int candidate = FirstPort; candidate <= LastPort; candidate++)
        {
            try
            {
                TcpListener probe = new TcpListener(IPAddress.Loopback, candidate);
                probe.Start();
                probe.Stop();
                return candidate;
            }
            catch (SocketException) { /* port busy — try the next one */ }
        }
        return 0;
    }

    private static int FailPortsBusy()
    {
        return Fail(
            "RPGAtlas could not find a free local port (" + FirstPort + "-" + LastPort + ").",
            "Close any other copy of RPGAtlas that may already be running, then try again.");
    }

    private static int Fail(string problem, string advice)
    {
        Console.WriteLine();
        Console.WriteLine("  " + problem);
        Console.WriteLine("  " + advice);
        Console.WriteLine();
        Console.WriteLine("  Press Enter to close.");
        Console.ReadLine();
        return 1;
    }
}
