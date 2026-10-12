# DuoSync 1.0.6

Release build of the DuoSync browser extension. This project is separate from the original DuoSync 0.3.2 extension, which remains unchanged.

## Features
- Dual video using direct video sources or tab capture.
- Synchronization using manually selected timestamps, with automatic offset correction.
- Movable and resizable picture-in-picture overlay.
- Video fitting: **Contain (no crop)**, **Fill area (crop edges)**, or **Stretch to fill**.
- Light and dark themes, with the preference saved.
- Player controls with icons, J/K/L shortcuts, and hold Space for temporary 2× speed.
- Playback settings menu for speed and video fitting.
- Independent volume controls for the base and overlay videos.
- Adjustable overlay opacity.

## Installation
1. Extract the ZIP archive.
2. Open `brave://extensions` and enable Developer mode.
3. Click **Load unpacked** and select the `duosync-final-forma2` folder.
4. On each video tab, open the DuoSync popup and click **Authorize this tab for capture**.
5. **On each site's video page, click the site's own fullscreen button before loading/capturing that video in DuoSync** if you want it to appear fullscreen in the extension. DuoSync cannot always force the source site's player into fullscreen automatically.
6. Open DuoSync, select the tabs, and try **Direct video**. If it does not work, use **Capture tabs**.
7. Enter the synchronization points and click **Sync**.

## Shortcuts
- `K`: play/pause both videos.
- `J` / `L`: seek backward/forward 10 seconds.
- Hold `Space`: attempts 2× speed; releasing it restores the selected speed.

## Note
JavaScript syntax, manifest format, and ZIP integrity have been checked. Final compatibility depends on each site's player and capture permissions; not every site has been tested in a real browser.
