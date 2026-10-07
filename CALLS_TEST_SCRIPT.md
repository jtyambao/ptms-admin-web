# Calls - real-device test script (Admin Web <-> Guard A72)

Calls are OFF by default. To test, deploy a build with the flag ON:

```powershell
$env:NEXT_PUBLIC_CALLS_ENABLED='true'; npm run deploy
```

(The flag is baked in at build time - a normal `npm run deploy` without it
ships Calls OFF again. Nothing else needs to change.)

**Before you start**
- Admin Web: signed in on a PC with a mic (and a webcam for the video tests). Open **Calls** in the left menu. The "Signaling connection" badge must say **Registered**. If it says Error, stop and tell the developer what it says.
- A72: Guard app signed in to a Site (the same Site you will call), screen on, app open in the foreground, mic/camera permission already granted.
- In the Calls page, the Site you pick should show `1/1 online` (or similar). If it shows `0/1`, the A72 has not reported in recently - open the app and wait about a minute.
- Click **Enable ringtone sound** the first time an incoming call rings (browsers block sound until a click).

**Test 1 - Admin Web calls the A72 (voice)**
1. Pick the Site, choose **Voice**, press **Call**.
2. A72 should ring. Admin Web says "Ringing...".
3. Answer on the A72. Both sides should say **Connected**, and you should hear each other.
Pass: audio both ways within ~10 seconds of answering.

**Test 2 - A72 calls Admin Web (voice)**
1. On the A72, call the office (Contacts -> Voice).
2. On Admin Web a window "Incoming voice call" appears, showing the Site, device name and OIC. (If you did not click Enable ringtone sound earlier you will not hear it - click it now.)
3. Press **Accept**. Check audio both ways.
Pass: the incoming window shows the right Site/device, and audio works.

**Test 3 - Video, both directions**
1. Repeat Test 1 but choose **Video**. Both sides should show the other's picture; your own small picture shows too.
2. Repeat Test 2 with **Video** from the A72.
Pass: picture and sound both ways.

**Test 4 - Mute / camera / end (during a connected call)**
1. Press **Mute** on Admin Web - the A72 should stop hearing you. Press **Unmute** - they hear you again.
2. (Video call) Press **Camera off** - the A72 sees your picture freeze/black. **Camera on** - it returns.
3. Press **End call** on Admin Web - the A72 call screen should close. Repeat, ending from the A72 instead - Admin Web should show "Ended" and return to the Site list within 3 seconds.

**Test 5 - Decline**
1. Admin Web calls the A72. On the A72, press **Decline**.
2. Admin Web should show "Ended - Declined".
3. A72 calls Admin Web. Press **Decline** on Admin Web. The A72 should show the call was declined.

**Test 6 - No answer**
1. Admin Web calls the A72 and nobody answers. After 45 seconds Admin Web cancels by itself and shows "Ended - No answer"; the A72 stops ringing.
2. A72 calls Admin Web and the A72 user hangs up before anyone accepts: the Incoming window disappears, and a line appears under **Missed calls (this session)**.

**Test 7 - Different networks (the one that matters most)**
Put the A72 on **mobile data** (Wi-Fi off) and Admin Web on the office network, then repeat Test 1 and Test 3. 
- If it connects: great.
- If it stays on "Connecting..." and then ends with "Connection failed", this is the limitation described in the TURN note: the calls need the Cloudflare TURN service. Give the developer the exact result.

**What to write down if anything fails**: which test number, what the Admin Web badge said, what the A72 showed, and the time (so the server logs can be checked).
