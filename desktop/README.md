# TAC-EL desktop app (Windows, Mac, Linux)

It opens the hosted church app in its own window:
1. First it shows a welcome page with a code to scan with your phone (Linked Devices).
2. Once linked, the window grows into the full app and remembers its size.
3. Closing the window keeps it running in the tray (Windows, Linux) so alerts still arrive. Quit from the tray icon.

## Set it up
1. The address is already set in config.json to https://tac-el-web.netlify.app. Change it only if the web app moves.
2. npm install        (inside this desktop folder, once)
3. npm start          (opens the app)

To try it against the app running on your own computer: start the web app (npm run dev in the parent folder), then here run npm run dev.

## Make an installer
Run on the system you are building for:
- Windows:  npm run dist:win     -> dist/TAC-EL Setup 1.0.0.exe
- Mac:      npm run dist:mac     -> dist/TAC-EL-1.0.0.dmg
- Linux:    npm run dist:linux   -> dist/*.AppImage and *.deb
(Windows installers must be built on Windows, Mac on a Mac. A free option for building all three is GitHub Actions; ask me for the file.)

## Notes
- Unsigned installers show a warning: Windows "Windows protected your PC" (More info > Run anyway), Mac "unidentified developer" (right-click > Open).
  To remove the warnings you need a code-signing certificate (Windows) and an Apple Developer account (Mac). Fine for testing.
- Google sign-in does not work in a desktop app (Google blocks it). Use the phone code or email and password.
- The app updates itself because it loads the hosted site: when you deploy a new version of the web app, the desktop app shows it next time it opens.
  The desktop shell itself (this folder) only needs a new installer when it changes.
- The app icon is build/icon.png (512 px). A sharper 1024 px logo gives a better Windows and Mac icon.
