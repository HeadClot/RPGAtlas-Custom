# Experimental ARM64 PortMaster exports

RPGAtlas can generate an experimental PortMaster package for ARM64 Linux:

```sh
npm run package:portmaster -- MyGame.json \
  --screenshot path/to/gameplay-640x480.png \
  --out MyGame-portmaster.zip
```

The command must run on an ARM64 Linux build host. It builds a native
`aarch64-unknown-linux-gnu` Tauri game binary, then adds PortMaster metadata,
launcher scripts, `gptokeyb` mappings, save-data environment variables, the
RPGAtlas license, and the supplied gameplay screenshot.

The screenshot must be PNG, at least 640×480, and 4:3. PortMaster requires a
gameplay screenshot rather than a title-screen or logo image.

This target is intentionally marked experimental (`rtr: false`). Tauri uses
WebKitGTK on Linux, while PortMaster devices commonly use KMS/DRM and SDL and
may require WestonPack or another compatible runtime. The generated launcher
does not claim that runtime availability; test the ZIP on the target CFW before
distributing it.

The build does not produce an AppImage and does not target ARMHF or x86_64.
Use the manual GitHub Actions workflow or an equivalent ARM64 Linux/Docker
builder when no ARM64 development machine is available.

## PortMaster layout

The ZIP contains the required `port.json`, capitalized `.sh` launcher,
`gameinfo.xml`, `screenshot.png`, `README.md`, `licenses/`, and a per-port
directory containing the ARM64 binary and `.gptk.1`/`.gptk.2` mappings.

The editor does not expose this target yet. It will be promoted to the editor
after the ARM64 runtime, rendering, audio, input, resolution, and save/load
checks pass on a supported handheld.
