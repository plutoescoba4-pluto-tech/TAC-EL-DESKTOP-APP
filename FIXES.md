# App fixes (round 1) — made before writing the SQL

Backend contracts the app now expects (to be built next):
- DB function `email_for_tac_id(tac_id text) returns text` (callable by anon, rate limited)
- DB function `mark_chat_messages_seen(message_ids uuid[])` (appends auth.uid() to delivered_to and read_by)
- Edge Function `claim-role`: POST { role: 'admin'|'presbytery', passcode } -> { role } or { error }
- DB owns `role` / `office` / `tac_el_id` (browser no longer sends them)

1. TAC ID no longer generated in the browser (authService).
2. Sign-up always creates a plain member; role/office never sent from the browser.
3. Admin/Presbytery passcodes removed from the shipped JavaScript; checked by `claim-role` (AdminLogin, PresbyteryLogin, Dashboard role picker, Google sign-in path). Presbytery in the role picker used to need no passcode at all.
4. Login with TAC ID for logged-out users now uses `email_for_tac_id` (was blocked by RLS).
5. "Verify TAC ID" screen: was blocked by RLS and said "verified" for any well-formed ID; now checks the real roster and no longer shows name/role to outsiders.
6. Chat receipts: one batched `mark_chat_messages_seen` call (fallback to old path) instead of 2 read+write calls per message (lost receipts, refetch storm).
7. Realtime lists: every subscription gets its own channel (shared names could throw or cancel each other's updates).
8. Direct messages: thread query filtered on the server (messages vanished once other chats pushed them out of the 60-row window).
9. "Clear chat" is one delete of the whole history (was one request per loaded message; older history stayed).
10. Treasurer "Paystack Reconciliation": was hardcoded fake transactions labelled "Gateway Live"; now reads real `giving_transactions` (momo/card). Invented fee/net columns removed.
11. ChatView crash: `setQuotaExceeded` was undefined (Firebase leftover).

Deferred on purpose (needs the Edge Functions): real Paystack checkout in MyGiving, removal of the client stale-room sweep and fund auto-creation.

# Round 2 — chat / voice check-up

12. Voice Sanctuary: people joining a room often never got audio with half of the others (offers were sent while their signaling channel was still opening, then never retried). Added a "hello" handshake so offers are re-sent when a peer becomes reachable.
13. Voice: ICE candidates arriving early were thrown away; now queued and applied.
14. Voice: a dropped connection (wifi to mobile data) is retried with an ICE restart (up to 3 times).
15. Voice: someone whose microphone is blocked/missing now joins as a listener (receive-only) instead of being stranded.
16. Voice: optional TURN server via VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL (needed on many mobile networks).
17. Voice recording: audio contexts are resumed (a suspended one records silence on Safari); host is warned before closing the tab mid-recording (the recording lives only in that browser until the room ends).
18. Ending a room: a blocked update used to fail silently and leave the room "live"; it now reports the failure.
19. Wrong "Limit is 850 KB" message (real limit is 9 MB).

# Round 3 — Website controls inside the admin dashboard

20. New admin screen "Website" (Admin menu, under Site Settings; route /dashboard/admin/website). It replaces the standalone page:
    show/hide switches for clubs, events, sermons and photos; add events/clubs/sermons; photo uploads with previews (gallery, leaders,
    rolling background); editable website wording (148 texts); contact details, service times and About page; visitor messages.
    Files: components/admin-portal/content/WebsiteManager.tsx and websiteTextRegistry.ts.
    Needs SQL 01 to 05 (switch columns, site-media bucket, admin rules). The admin is already signed in, so no open-access policies are needed.
    If new text is added to a website page, regenerate websiteTextRegistry.ts so it appears in the "Wording" tab.

# Round 4 — Real chats (needs SQL 06 and 06b)

21. Chat photos, voice notes, videos and files now go to the PRIVATE storage bucket "chat-media" (not into the message rows). The app signs a 6-hour link when it shows them. Old messages that still hold the media inside the row keep working. (lib/chatMedia.ts, services/chatService.ts)
22. Unread counts are kept on the server, so a second phone shows the right numbers. (lib/chatUnread.ts; falls back to the old per-device count if the SQL is not installed)
23. Delivered ticks are real: a message is marked delivered the moment it reaches the other person's phone (and anything missed while offline is caught up when the app opens). Direct messages now use delivered_at / read_at instead of guessing from "online".
24. Reactions (one emoji per person per message) in the group chat and direct messages: open a message's menu and pick one; chips show under the message. (components/chat/ChatExtras.tsx)
25. Mute: bell button in each chat header, for 8 hours, 1 week or always. A muted chat makes no sound or pop-up and does not add to the badge.
26. Blocking in direct messages: the blocker chooses a reason, the person is not told, their messages never reach the blocker (they see one tick). The reason and the last 5 messages go to the admins. The group chat is not affected.
27. Admin > Chat Reports: review each report and decide: unblock, or keep the block (for a number of days, during which the blocker cannot unblock early); optionally suspend the reported person from chat for a number of days and send them a warning. Lists suspensions with a "Restore access" button. (components/admin-portal/communication-hub/ChatReports.tsx)
28. Suspended people can still read but cannot send messages or reactions; a notice replaces the message box.
29. Location sharing: clearer errors (permission denied, GPS off) and better accuracy.

Not done: old messages that still contain photos/voice inside the row are not moved to storage automatically; clear old history (admin) or leave them.

# Round 5 — Hidden features, no API keys

30. The Bible reader, the Seek AI and the Kin AI are hidden from the app (bottom "Sanctuary" tab, the "Scriptures (Bible)" menu, the "Open Bible" / "Read More" / "Bible Reader" buttons, the floating circle, and the Bible and Kin AI admin pages). The code stays. One switch file turns them back on: src/lib/features.ts (change false to true). The Living Word verse on Home stays (it is set by the admin, no API).
31. All API keys removed from the code. server.ts used to carry three Groq keys and a Bible key as fallbacks; they are gone, and .env.example no longer lists AI keys. Set real keys on the SERVER only if you turn those features on later.
32. .env.local (your Supabase URL and anon key) is included so the app runs after npm install and npm run dev.

# Round 6 — No more blank screen

33. The Supabase URL and anon key are now built into src/supabase.ts as a fallback (they are public by design), so a missing or misplaced .env.local can no longer stop the app from starting. A value in .env.local still takes priority.
34. Added an error screen (src/components/ErrorBoundary.tsx) so a crash while drawing the app shows the error message instead of a white page, and a start-up watchdog in index.html that shows errors from files that fail to load (and says so if nothing appears within 8 seconds).

# Round 7 — Phase 1 (needs SQL 06c)

35. TAC ID is configurable: Admin > Member IDs (prefix, separator, minimum digits, next number; preview). Starts as TACEL100. New members follow the saved format; a separate, confirmed button re-issues EVERYONE's ID (each member is notified). (components/admin-portal/TacIdSettings.tsx)
36. Forgot password by emailed 6-digit code on the member, admin and presbytery login screens; accepts email or TAC ID. See SETUP-EMAIL-CODES.md. (components/entry/ForgotPassword.tsx, authService)
37. Hymns: the admin pastes a whole hymn and splits it into verses and choruses (several choruses, reorder, relabel); members and presbytery see them in singing order. FIXED: the chorus and category were never saved before; the hymn list now refreshes after saving; only admins can edit (presbytery was shown edit buttons it could not use). (components/shared/HymnSections.tsx, lib/hymnParse.ts)
38. Website: "Get for iOS" now opens a step-by-step page (Share > Add to Home Screen > open > allow notifications) with a Get button to the app address; the Android button switches on when a Google Play link is saved. Both links are set in Admin > Website > Contact & times > App links. All wording on the new page is editable.
39. New "Messages" screen: your direct-message conversations, newest first, with unread counts and search. (components/sections/MessagesList.tsx)
40. Stale voice rooms are ended by an admin's browser (and by the database every 30 minutes) instead of every member's browser.

# Round 8 — Phase 2A: installable app and notification groundwork (needs SQL 06d)

41. The app is now an installable PWA: manifest, icons (placeholders from the small logo file), service worker (offline page, push receiving, tap to open the right screen), iPhone Home Screen tags. (public/, index.html, src/main.tsx)
42. Install and notification prompts: a small card at the right moment (iPhone in Safari: how to add to Home Screen; notifications not yet asked: "Turn on", never automatic; Android/computer: "Install"). Hidden for a week with "Not now". (src/components/pwa/PwaPrompts.tsx, src/lib/push.ts)
43. Notifications screen (menu > Notifications): on/off for this device, eight categories to choose from, a test notification. (src/components/sections/NotificationSettings.tsx)
44. Netlify hosting file (netlify.toml): static build, single-page redirect, no-cache for the service worker.
Not yet: sending notifications while the app is closed (needs the push key pair and the sending function). While the app is open, notifications already work.

# Round 9 — Phase 2B: notifications while the app is closed (needs SQL 06e and PUSH-SETUP.md)

45. New Edge Function supabase/functions/send-push/index.ts: sends Web Push to members' phones and computers. It respects each person's categories, muted chats and blocks, removes dead devices, and is called only by the database with a shared secret.
46. Database triggers (06e-push-triggers.sql) notify on: group chat, direct messages, approved notices, new events, new sermons, live rooms, Build in Christ posts, answered prayer requests, and office messages in the member's inbox. Nothing is sent until tac_push_configure(...) is run, and a failure to send can never break the post that caused it.
47. The service worker no longer pops up a notification while the app is open on screen (except on iPhone, where Apple requires one).

# Round 10 — Android page

48. New website page "Get on Android" (public-site/get-android.html): Option 1 Google Play (switches on when a Play link is saved), Option 2 direct APK download with install steps and a safety note. The Android button on the Get App page now opens it.
49. Admin > Website > Contact & times > App links now also holds the APK download link and an optional version note.

# Round 11 — Linked devices (needs SQL 06f and the device-link function)

50. Sign in on a computer by scanning a QR code with the phone (like WhatsApp Web). The phone plus up to 2 linked devices; linking a third signs the oldest out automatically. (src/lib/deviceLink.ts, components/entry/LinkWithPhone.tsx, components/sections/LinkedDevices.tsx, supabase/functions/device-link)
51. "Sign in with your phone (QR)" on the member, admin and presbytery sign-in screens; "Linked Devices" in the menu (list, sign one out, sign all out, link a new one by camera or typed code).
52. A linked computer checks every minute that the phone has not signed it out, and signs itself out if so. Every link or automatic sign-out leaves a message in the owner's inbox.
New libraries: qrcode, jsqr (run npm install).

# Round 12 — Passcodes on the server

53. claim-role Edge Function (supabase/functions/claim-role): the admin and presbytery passcodes are checked on the server against Supabase secrets, with a 5-tries-per-15-minutes limit, a log (06g role_claims) and a notification to every admin when someone new gains access. The app already calls it (round 1).

# Round 13 — Desktop app, Netlify packages

54. Desktop app (desktop/ folder, Electron): opens the hosted app in its own window. First a medium welcome window with a code to scan with the phone (Linked Devices); once linked it shows "Loading your chats" and the window grows into the full app (remembers size and position). Closing keeps it running in the tray (Windows/Linux) so alerts arrive; unread count on the dock/taskbar; links to other sites open in the normal browser; Windows/Mac/Linux installers via electron-builder. See desktop/README.md.
55. The web app recognises the desktop app (src/lib/desktop.ts): shows the desktop welcome page instead of the website-style landing page, hides Google sign-in (Google blocks it in desktop apps).
56. The old Firebase-hosted logo link is replaced by the logo shipped with the app, so a dead link can no longer leave a blank logo.
57. Test deployments: robots.txt and noindex on the app, a Netlify-ready website-only package, and NETLIFY-TEST-BOTH.md.
58. Website: the "TAC Portal for Desktop" page had a fake QR code and phone-number form; it now offers the real options (open in browser, or download the desktop app). The desktop download link is saved in Admin > Website > App links.

# Round 14 — Build the installers in the cloud

59. GitHub Actions workflow (.github/workflows/desktop.yml) builds the Windows, Mac (Intel and Apple chip) and Linux installers and, on a desktop-v* tag, publishes them as a Release. Guide: DESKTOP-BUILD.md.

# Round 15 — Computer flow like WhatsApp, website v4

60. A computer (desktop app OR a browser on a computer) first shows the welcome screen with the code to scan; after linking, the next opening goes straight into the app. Phones sign in directly and are the ones that scan.
61. "Sign in with your phone (QR)" appears only on computers; "Link a device" (the scanner) only on phones. On a computer, the Linked Devices screen explains where to link from.
62. The welcome screen in a browser also offers the desktop app download when the admin has saved its link.
63. Admin > Website uploads go to the website's own `website-media` bucket (folders hero, leaders, gallery) as the new website expects; the list of editable texts is rebuilt from website v4 (210 texts, 15 pages including "I'm New").

# Round 16 — Admin > Website now covers the whole website v7/v8 contract (needs SQL 06h)

64. New tabs: Home page (slideshow with computer + phone pictures, caption, button, style; welcome picture; pastor's welcome; watch online), I'm New (block builder: steps, cards, text with photo, questions and answers, visitor card), Giving (payment link and QR, Mobile Money, bank), Contact & links (address, phone, email, WhatsApp, Google map, service times, social icons, About, church logo, Get-the-app links), Helper (answers for the website's help bubble). The slideshow, settings and About cards moved into these tabs.
65. Pictures are resized in the browser before upload and go to the website's `website-media` bucket (phone photos up to 25 MB are accepted; the website gets about 300 KB). Logos keep their transparency.
66. Messages: filters for New, "I'm New" visitor cards and contact-form messages.
67. The list of editable texts is rebuilt from website v8 (210 texts, 15 pages). Website v8 = your v7 plus the device-aware "Get the App" buttons.
New files: src/components/admin-portal/content/{websiteShared,HomeTab,NewHereTab,GivingTab,HelperTab,ContactLinksTab}.tsx

# Round 17 — Linking diagnostics

68. The linking screen now says exactly why a code could not be created (function not deployed, refused, or a database problem) and shows an HTTP status; if the QR picture cannot be drawn it says so instead of spinning, and the typed code still works.
69. The device-link, claim-role and livekit-token functions now answer with whatever request headers the browser asks to send (newer app libraries add extra headers, which could make a browser refuse the answer).
