# TAC-EL Web (the computer app)

For computers: in a browser, or inside the desktop app (Windows, Mac, Linux). Like WhatsApp Web:
the first time, a welcome screen shows a code. Scan it with TAC-EL on your phone (menu > Linked Devices > Link a device).
Prefer not to scan? "Sign in with email instead" works too. After that it opens straight into the app.
On a phone this app points people to the TAC-EL phone app.

## 1. Put it on Netlify
    npm install
    npm run build          (makes the folder  dist)
netlify.com > Add new site > Deploy manually > drag the  dist  folder. Rename it, for example  tac-el-web.
Then in the app: Admin > Website > Contact & links > App links > "TAC-EL Web address" = that address.
The website's "Get for computer" page uses it for "Open TAC-EL in your browser".

## 2. The desktop app
It lives in the desktop folder and simply opens TAC-EL Web in its own window.
See DESKTOP-BUILD.md (building Windows, Mac and Linux installers in the cloud) and desktop/README.md.
The desktop app is already set to https://tac-el-web.netlify.app (desktop/config.json). Change it there if the address ever changes.
Put the installer's download link in Admin > Website > Contact & links > App links > "Desktop app download link".

## 3. Good to know
- Up to 3 devices per person: the phone plus up to 2 linked computers (the oldest is signed out when a third is added).
- Notifications on computers use web notifications (PUSH-SETUP.md).
- Both apps (phone and web) use the same Supabase project, so chats and messages are the same everywhere.
