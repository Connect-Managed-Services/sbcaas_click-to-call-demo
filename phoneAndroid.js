'use strict';

/*
   Tutorial
   Simple click-to-Call phone

   URL parameters:
    'call' call to user name (or phone number). Must be set.
    'caller' caller user name. Optional (default 'Anonymous')
    'callerDN'   caller display name. Optional (default 'Anonymous')
    'server'  Optional. Replace default SBC server address (from config.js) to the parameter value.
 */

let phone = new AudioCodesUA(); // phone API
let audioPlayer = new AudioPlayer2(); // Play ring, ringback & busy tones.
let wakeLock = null; // to support Android screen lock
let activeCall = null; // not null, if exists active call
let serverAddress; //address of webrtc server
let iceServers = [];
let sipDomain;
let caller;
let callerDn;
let callTo; // number to call
let xCustomerHeader;
let xServiceHeader;

// Run when document is ready
function documentIsReady() {
    phone.setAcLogger(ac_log);
    phone.setJsSipLogger(console.log);

    ac_log(`------ Date: ${new Date().toDateString()} -------`);
    ac_log(`AudioCodes WebRTC SDK. Simple click-to-call`);
    ac_log(`SDK: ${phone.version()}`);
    ac_log(`SIP: ${JsSIP.C.USER_AGENT}`);
    ac_log(`Browser: ${phone.getBrowserName()} Internal name: ${phone.getBrowser()}`);

    audioPlayer.init({ logger: ac_log });
  
    // Check WebRTC support.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        let noWebRTC = 'WebRTC API is not supported in this browser !';
        guiError(noWebRTC);
        ac_log(noWebRTC);
        return;
    }

    // Get server address parameter from URL
    serverAddress = [getParameter('server-address')];
    if (serverAddress === null) {
        let missedServerAddressParameter = 'Missed "server-address" parameter in URL';
        guiError(missedServerAddressParameter);
        ac_log(missedServerAddressParameter);
        return;
    }

    // Get sipDomain parameter from URL
    sipDomain = getParameter('sip-domain');
    if (sipDomain === null) {
        let missedSipDomainParameter = 'Missed "sip-domain" parameter in URL';
        guiError(missedSipDomainParameter);
        ac_log(missedSipDomainParameter);
        return;
    }

    // Get caller parameters from URL
    caller = getParameter('caller');
    if (caller === null) {
        let missedCallerParameter = 'Missed "caller" parameter in URL';
        guiError(missedCallerParameter);
        ac_log(missedCallerParameter);
        return;
    }

    // Get callerDn parameters from URL
    callerDn = getParameter('caller-dn');
    if (callerDn === null) {
        let missedCallerDnParameter = 'Missed "caller-dn" parameter in URL';
        guiError(missedCallerDnParameter);
        ac_log(missedCallerDnParameter);
        return;
    }

    // Get call parameters from URL
    callTo = getParameter('call');
    if (callTo === null) {
        let missedCallParameter = 'Missed "call" parameter in URL';
        guiError(missedCallParameter);
        ac_log(missedCallParameter);
        return;
    }

    // Get xCustomerHeader parameters from URL
    xCustomerHeader = getParameter('x-customer-header');
    if (xCustomerHeader === null) {
        let missedxCustomerHeaderParameter = 'Missed "x-customer-header" parameter in URL';
        guiError(missedxCustomerHeaderParameter);
        ac_log(missedxCustomerHeaderParameter);
        return;
    }

    // Get xserviceHeader parameters from URL
    xServiceHeader = getParameter('x-service-header');
    if (xServiceHeader === null) {
        let missedxServiceHeaderParameter = 'Missed "x-service-header" parameter in URL';
        guiError(missedxServiceHeaderParameter);
        ac_log(missedxServiceHeaderParameter);
        return;
    }

    guiInit();

    // Prepare audio data
  audioPlayer.downloadSounds('sounds/', SoundConfig.downloadSounds)
    .then(() => {
        let tones = Object.assign({}, SoundConfig.generateTones, audioPlayer.dtmfTones);
        return audioPlayer.generateTonesSuite(tones);
    })
    .then(() => {
        ac_log('audioPlayer: sounds are ready:', audioPlayer.sounds);
    });
   
    // Check devices: microphone must exist
    // Note: the method implementation moved to phone API.
    phone
      .checkAvailableDevices()
      .then(() => {
         initSipStack({ user: caller, displayName: callerDn, password: '' });
      })
      .catch((e) => {
         ac_log('error', e);
         guiError(e);
      })
}

function ac_log() {
    let args = [].slice.call(arguments)
    console.log.apply(console, ['%c' + args[0]].concat(['color: BlueViolet;'], args.slice(1)));
}

function getParameter(name, defValue = null) {
    let s = window.location.search.split('&' + name + '=')[1];
    if (!s) s = window.location.search.split('?' + name + '=')[1];
    return s !== undefined ? decodeURIComponent(s.split('&')[0]) : defValue;
}

function initSipStack(account) {
    phone.setServerConfig(serverAddress, sipDomain, iceServers);
    phone.setAccount(account.user, account.displayName, account.password);

    // Set phone API listeners
    phone.setListeners({
        loginStateChanged: function (isLogin, cause) {
            switch (cause) {
                case "connected":
                    ac_log('phone>>> loginStateChanged: connected');
                    guiMakeCall(callTo);
                    break;
                case "disconnected":
                    ac_log('phone>>> loginStateChanged: disconnected');
                    if (phone.isInitialized()) // after deinit() phone will disconnect SBC.
                        guiError('Cannot connect to SBC server');
                    break;
                case "login failed":
                    ac_log('phone>>> loginStateChanged: login failed');
                    break;
                case "login":
                    ac_log('phone>>> loginStateChanged: login');
                    break;
                case "logout":
                    ac_log('phone>>> loginStateChanged: logout');
                    break;
            }
        },

        outgoingCallProgress: function (call, response) {
         ac_log('phone>>> outgoing call progress');
         document.getElementById('outgoing_call_progress').innerText = 'ring ring';
         if (response.body) {
             call.data['outgoingCallProgress_played'] = true; // If the 18x respone includes SDP, the server plays sound
         } else if (!call.data['outgoingCallProgress_played']) {
             call.data['outgoingCallProgress_played'] = true; // To prevent duplicate playing.
             audioPlayer.play(SoundConfig.play.outgoingCallProgress);
         }
       },

        callTerminated: function (call, message, cause, redirectTo) {
            ac_log(`phone>>> call terminated callback, cause=${cause}`);
            if (call !== activeCall) {
              ac_log('terminated no active call');
              return;
            }
            activeCall = null;
            guiWarning('Call terminated: ' + cause);
            audioPlayer.stop();
            phone.deinit(); // Disconnect from SBC server.
            guiShowPanel('call_terminated_panel');
            await callWakeLock.release(); // for Android screen lock
            document.removeEventListener('visibilitychange', handleVisibilityChange); // for Android screen lock
          },

        callConfirmed: function (call, message, cause) {
            ac_log('phone>>> callConfirmed');
            guiInfo('');
            audioPlayer.stop();
            await enableWakeLock(); // for Android lock screen
            document.addEventListener('visibilitychange', handleVisibilityChange);  // for Android lock screen
            guiShowPanel('call_established_panel');
          },

        callShowStreams: function (call, localStream, remoteStream) {
            ac_log('phone>>> callShowStreams');
            let remoteAudio = document.getElementById('remote_audio');
            remoteAudio.srcObject = remoteStream; // to play audio
        },

        incomingCall: function (call, invite) {
            ac_log('phone>>> incomingCall');
            call.reject();
        },

        callHoldStateChanged: function (call, isHold, isRemote) {
            ac_log('phone>>> callHoldStateChanged ' + isHold ? 'hold' : 'unhold');
        }
    });

    guiInfo('Connecting...');
    phone.init(false);
}

function onBeforeUnload() {
    phone !== null && phone.isInitialized() && phone.deinit();
}

function guiInit() {
  window.addEventListener('beforeunload', onBeforeUnload);
  document.getElementById('cancel_outgoing_call_btn').onclick = guiHangup;
  document.getElementById('hangup_btn').onclick = guiHangup;
  document.getElementById('mute_audio_btn').onclick = guiMuteAudio;
  document.getElementById('keypad_btn').onclick = guiToggleDTMFKeyPad;
}

function guiMakeCall(callTo, extraHeaders = []) {
  if (activeCall !== null) throw 'Already exists active call';
  document.getElementById('outgoing_call_user').innerText = callTo;
  document.getElementById('outgoing_call_progress').innerText = '';
  document.getElementById('call_established_user').innerText = callTo;
  guiInfo('');
  guiShowPanel('outgoing_call_panel');
  // Add X-Customer Header
  extraHeaders.push(`X-WebRTC-Customer: ${xCustomerHeader}`);
  extraHeaders.push(`X-WebRTC-Service: ${xServiceHeader}`);
  activeCall = phone.call(phone.AUDIO, callTo, extraHeaders);
}

function guiHangup() {
  if (activeCall !== null) {
    activeCall.terminate();
    await callWakeLock.release(); // for Android screen lock
    document.removeEventListener('visibilitychange', handleVisibilityChange); // for Android screen lock
    activeCall = null;
  }
}

function guiSendDTMF(key) {
    if (activeCall != null) {
        audioPlayer.play(Object.assign({ 'name': key }, SoundConfig.play.dtmf));
        activeCall.sendDTMF(key);
    }
}

function guiToggleDTMFKeyPad() {
    if (guiIsHidden('dtmf_keypad')) {
        ac_log('show DTMF keypad');
        document.getElementById('keypad_btn').value = 'Close keypad';
        guiShow('dtmf_keypad');
    } else {
        ac_log('hide DTMF keypad');
        document.getElementById('keypad_btn').value = 'Keypad';
        guiHide('dtmf_keypad');
    }
}

function guiMuteAudio() {
    let muted = activeCall.isAudioMuted();
    activeCall.muteAudio(!muted);
    document.getElementById('mute_audio_btn').value = !muted ? 'Unmute' : 'Mute';
}

//--------------- Status line -------
function guiError(text) {
   guiStatus(text, 'Pink');
}

function guiWarning(text) {
   guiStatus(text, 'Gold');
}

function guiInfo(text) {
   guiStatus(text, 'Aquamarine');
}

function guiStatus(text, color) {
    let line = document.getElementById('status_line');
    line.setAttribute('style', `background-color: ${color}`);
    line.innerHTML = text;
}

//--------------- Show or hide element -------
function guiShow(id) {
    document.getElementById(id).style.display = 'block';
}

function guiHide(id) {
    document.getElementById(id).style.display = 'none';
}

function guiIsHidden(id) {
    let elem = document.getElementById(id);
    let display = window.getComputedStyle(elem).getPropertyValue('display');
    return display === 'none';
}

function guiShowPanel(activePanel) {
    const panels = ['call_terminated_panel', 'outgoing_call_panel', 'call_established_panel'];
    for (let panel of panels) {
        if (panel === activePanel) {
            guiShow(panel);
        } else {
            guiHide(panel);
        }
    }
}

//code to handle Android screen lock
async function enableWakeLock() {
  try {
    if ('wakeLock' in navigator && window.isSecureContext) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock active');
    }
  } catch (err) {
    console.warn('Wake lock failed:', err);
  }
}

async function disableWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

async function handleVisibilityChange() {
  if (!activeCall) return; // no call → do nothing

  if (document.visibilityState === 'visible' && !wakeLock) {
    await enableWakeLock();
  }
}
