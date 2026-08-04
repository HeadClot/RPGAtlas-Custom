/* RPGAtlas standalone Windows launcher. GPL-3.0-or-later (see LICENSE).
   The exporter appends a UTF-8 HTML game after PayloadMarker. */
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class RPGAtlasLauncher
{
    private const string PayloadMarker = "RPGATLAS_GAME_PAYLOAD_V1\n";

    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            byte[] executable = File.ReadAllBytes(Application.ExecutablePath);
            byte[] marker = Encoding.ASCII.GetBytes(PayloadMarker);
            int payloadStart = LastIndexOf(executable, marker);
            if (payloadStart < 0)
                throw new InvalidDataException("This executable does not contain an RPGAtlas game.");

            payloadStart += marker.Length;
            string gameName = SafeName(Path.GetFileNameWithoutExtension(Application.ExecutablePath));
            string gameDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "RPGAtlas Games",
                gameName);
            Directory.CreateDirectory(gameDirectory);

            string gamePath = Path.Combine(gameDirectory, "game.html");
            using (FileStream output = File.Create(gamePath))
                output.Write(executable, payloadStart, executable.Length - payloadStart);

            if (args.Length == 0 || args[0] != "--extract-only")
                Process.Start(new ProcessStartInfo(gamePath) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "The game could not be started.\n\n" + error.Message,
                "RPGAtlas Game",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static int LastIndexOf(byte[] source, byte[] value)
    {
        for (int i = source.Length - value.Length; i >= 0; i--)
        {
            int j = 0;
            while (j < value.Length && source[i + j] == value[j]) j++;
            if (j == value.Length) return i;
        }
        return -1;
    }

    private static string SafeName(string name)
    {
        foreach (char invalid in Path.GetInvalidFileNameChars())
            name = name.Replace(invalid, '_');
        return string.IsNullOrWhiteSpace(name) ? "RPGAtlas Game" : name;
    }
}
