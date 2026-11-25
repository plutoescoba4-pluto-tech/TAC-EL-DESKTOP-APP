# Get for desktop: how the download button works, step by step

What people will experience: tap "Get for desktop" on the website, TAC-EL-Setup.exe starts downloading,
they open it, an installer window appears (Next, choose folder, Install, Finish), and a TAC-EL icon is on their desktop.

You do 3 things once: build the installer, host it, and paste its link in Admin.

## 1. Build the installer (no Windows computer needed)
1. Make a free GitHub account and a new PRIVATE or public repository, for example tac-el-web.
2. Upload the whole contents of this folder (tac-el-web) to it, including the hidden .github folder.
3. On GitHub open Actions > "Build desktop app" > Run workflow. Wait about 10 minutes.
4. When it finishes, open the repository's Releases page. You will see a release called "TAC-EL desktop app" with
   TAC-EL-Setup.exe (Windows), TAC-EL.dmg (Mac) and TAC-EL.AppImage (Linux).

(To build on your own Windows laptop instead: open a terminal in the desktop folder, run  npm install  then  npm run dist:win.
The file appears in desktop/dist/TAC-EL-Setup.exe.)

## 2. Get the link
The link never changes, so you only paste it once:
    https://github.com/YOUR-GITHUB-NAME/YOUR-REPOSITORY/releases/download/desktop/TAC-EL-Setup.exe
For a private repository GitHub will ask people to sign in, so use a PUBLIC repository for the download.
(Only the installer needs to be public. Your church data is never in it: the app loads from Supabase.)

## 3. Paste it in the app
Admin > Website > Contact links > "Desktop app download link" > paste the link > Save.
The "Get for desktop" button on the website and the app now start the download.

## What people will see
- Windows: "Windows protected your PC" the first time (More info > Run anyway). This is because the installer is not
  code-signed yet. A signing certificate costs money; fine for launch if you tell members to tap "Run anyway".
- Mac: "unidentified developer": right-click the app > Open.
- Google sign-in does not work in the desktop app. Members use email and password or the phone code.

## When you change the app
Nothing to do. The desktop app opens your hosted site, so it shows the new version next time it starts.
Rebuild the installer only when the desktop folder itself changes.
