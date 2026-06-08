'use strict';

const userAgent = 'JasonWebSdk v5.2'
const c2c_sbcDisconnectCounterMax = 5;
const c2c_sbcDisconnectDelay = 60;   // After call termination keep SBC connection the time interval (seconds)

let c2c_phone = new AudioCodesUA(); // phone API
let c2c_ac_log = console.log;       // phone logger
let c2c_audioPlayer = new AudioPlayer2();
let c2c_activeCall = null; // tracks call state
let c2c_sbcDisconnectCounter = 0;
let c2c_sbcDisconnectTimer = null;
let c2c_devices = null; // select devices feature, not for all OS/browsers.
let c2c_hasAudio = false;

// requried URL Params to make call
let callTo;
let domain;
let server;
let caller;
let callerDn;
let xCustomerHeader;
let xServiceHeader;
let xExtraHeaders;

// ---------- HTML elements ----------
let c2c_callButton = document.getElementById('c2c_callButton');
let c2c_callButtonText = document.getElementById('c2c_callButtonText');
let c2c_muteButton = document.getElementById('c2c_muteButton');
let c2c_dtmfKeypad = document.getElementById('c2c_dtmfKeypad');
let c2c_remoteAudio = document.getElementById('c2c_remote_audio');
let c2c_devicesDialog = document.getElementById("c2c_select_devices_dialog");


// ----------- Functions ----------
// set console timestamp format
function c2c_timestamp() {
	let date = new Date();
	let h = date.getHours();
	let m = date.getMinutes();
	let s = date.getSeconds();
	let ms = date.getMilliseconds();
	return ((h < 10) ? '0' + h : h) + ':' + ((m < 10) ? '0' + m : m) + ':' + ((s < 10) ? '0' + s : s) + '.' + ('00' + ms).slice(-3) + ' ';
}

// set console loggers
function c2c_setConsoleLoggers() {
	let useColor = ['chrome', 'firefox', 'safari'].includes(c2c_phone.getBrowser());
	const log1 = function () {
		let args = [].slice.call(arguments);
		let firstArg = [c2c_timestamp() + '' + (useColor ? '%c' : '') + args[0]];
		if (useColor) firstArg = firstArg.concat(['color: BlueViolet;']);
		console.log.apply(console, firstArg.concat(args.slice(1)));
	};
	let log2 = function () {
		let args = [].slice.call(arguments);
		let firstArg = [c2c_timestamp() + args[0]];
		console.log.apply(console, firstArg.concat(args.slice(1)));
	};
	c2c_ac_log = log1;              // phone log
	c2c_phone.setAcLogger(log1);    // api log
	c2c_phone.setJsSipLogger(log2); // jssip log
}

// initialise webpage
async function c2c_init() {
    c2c_setConsoleLoggers();
    c2c_ac_log(`------ Date: ${new Date().toDateString()} -------`);
	c2c_ac_log(userAgent);
	c2c_ac_log(`Status: Production`);
	c2c_ac_log(`Browser: ${c2c_phone.getBrowserName()}  Internal name: ${c2c_phone.getBrowser()}|${c2c_phone.getOS()}`);

    // set SIP user-agent header
    c2c_phone.setUserAgent(`${userAgent}, ${c2c_phone.getBrowserName()}`);

	// set devices
	c2c_devices = new SelectDevices();

	c2c_devices.setDevices(true,
		[{ name: 'microphone', kind: 'audioinput' },
		{ name: 'speaker', kind: 'audiooutput' }]);

	// click-to-call does not use local storage, but uses session storage
	// to restore selected devices after page reload.
	let selectedDevices = sessionStorage.getItem('c2c_selectedDevices');
	if (selectedDevices !== null) {
		c2c_devices.load(JSON.parse(selectedDevices));
	}

	await c2c_devices.enumerate(false);

    // Check WebRTC support. If loaded from unsecure context (HTTP site) the WebRTC API is hidden. 
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		c2c_gui_phoneDisabled('WebRTC API is not supported in this browser !');
		return;
	}

	// Check presence of microphone, speaker, web camera.
	try {
		c2c_hasAudio = await c2c_phone.checkAvailableDevices();
		c2c_ac_log(`Audio is ${c2c_hasAudio ? 'present' : 'missing'}`);
	} catch (e) {
			c2c_ac_log('No microphone or speaker !'); // Please connect headset and reload page.
			c2c_callButtonText.innerHTML = 'No Mic/Speaker';
			return;
	}

	// Prepare audio player
	c2c_audioPlayer.init({ logger: c2c_ac_log });

	// generate tones
	await c2c_audioPlayer.generateTonesSuite(c2c_soundConfig.generateTones);

	//generate DTMF Tones (to play to web user)
	let { A, B, C, D, ...basicDtmfTones } = c2c_audioPlayer.dtmfTones; // exclude A,B,C,D tones
	await c2c_audioPlayer.generateTonesSuite(basicDtmfTones);

	c2c_ac_log('audioPlayer2: sounds are ready');

	if (c2c_devices) {
		let spkrId = c2c_devices.getSelected('speaker').deviceId;
		c2c_audioPlayer.setSpeakerId(spkrId);
	}

	// mandatory url parameters
	callTo = c2c_getStrUrlParameter('call');
	if (!callTo) {
		c2c_ac_log(`Error: URL parameter "call" is missing.`);
	}

	domain = c2c_getStrUrlParameter('domain');
	if (!domain) {
		c2c_ac_log(`Error: URL parameter "domain" is missing.`);
	}

	server = [c2c_getStrUrlParameter('server')];
	if (!server) {
		c2c_ac_log(`Error: URL parameter "server" is missing.`);
	}

	caller = c2c_getStrUrlParameter('caller');
	if (!caller) {
		c2c_ac_log(`Error: URL parameter "caller" is missing.`);
	}

	callerDn = c2c_getStrUrlParameter('callerDn');
	if (!callerDn) {
		c2c_ac_log(`Error: URL parameter "callerDn" is missing.`);
	}

	xCustomerHeader = c2c_getStrUrlParameter('x-customer-header');
	if (!xCustomerHeader) {
		c2c_ac_log(`Error: URL parameter "x-customer-header" is missing.`);
	}

	xServiceHeader = c2c_getStrUrlParameter('x-service-header');
	if (!xServiceHeader) {
      	c2c_ac_log(`Error: URL parameter "x-service-header" is missing.`);
	}

	// optional read extra headers from array in URL params
	xExtraHeaders = c2c_getStrUrlParameter('x-headers');
	if (xExtraHeaders) {
		xExtraHeaders = JSON.parse(xExtraHeaders)
		c2c_ac_log(`Extra Headers to add: ${xExtraHeaders}}.`);
	}

	// check if disconnct timer is not null, if not then cancel it to prevent 'c2c_phone.deinit();'
    if (c2c_sbcDisconnectTimer !== null) {
		clearTimeout(c2c_sbcDisconnectTimer);
		c2c_sbcDisconnectTimer = null;
	}

    await c2c_sbc_connect_sequence();

}

// Get URL parameters
function c2c_getStrUrlParameter(name, defValue = null) {
	let s = window.location.search.split('&' + name + '=')[1];
	if (!s) s = window.location.search.split('?' + name + '=')[1];
	return s !== undefined ? decodeURIComponent(s.split('&')[0]) : defValue;
}

// Connect to SBC server, don't send REGISTER (init(false))
function c2c_initStack(account) {
    c2c_phone.setServerConfig(server, domain);
    c2c_phone.setAccount(account.user, account.displayName,'');

    c2c_phone.setListeners({
        loginStateChanged: function(isLogin, cause) {
            switch (cause) {
                case 'connected':
                    c2c_ac_log('phone>>> stateChanged: connected');
                    if (c2c_activeCall !== null) {
						c2c_ac_log('phone: active call exists (SBC might have switched over to secondary)');
						break;
					}
                    break;

                case 'disconnected':
					c2c_ac_log('phone>>> stateChanged: disconnected');
					if (c2c_phone.isInitialized()) {
						if (c2c_sbcDisconnectCounter++ >= c2c_sbcDisconnectCounterMax && c2c_activeCall === null) {
							c2c_ac_log('phone: too many disconnections.');
							c2c_phone.deinit();
							c2c_gui_phoneBeforeCall();
						}
					}
					break;

            }
        },
        outgoingCallProgress: function(call, response) {
			if(!response.body){// SDP is missing so play ringback
				c2c_ac_log('phone>>> outgoing call progress (no SDP)');
				c2c_audioPlayer.play(c2c_soundConfig.play.outgoingCallProgress);
			} else {
				c2c_ac_log('phone>>> outgoing call progress (with SDP)');
			}
            c2c_callButtonText.innerHTML = 'Ringing/Hangup';
        },
        callTerminated: function(call, message, cause) {
            c2c_ac_log(`phone>>> call terminated callback, cause=${cause}`);
			c2c_activeCall = null;
			c2c_audioPlayer.stop();

			//play correct end tone
			if (call.isOutgoing() && !call.wasAccepted()) {
				// Busy tone.
				c2c_audioPlayer.play(c2c_soundConfig.play.busy);
			} else {
				// Disconnect tone.
				c2c_audioPlayer.play(c2c_soundConfig.play.disconnect);
			}

			if (c2c_sbcDisconnectDelay === 0) {
				c2c_phone.deinit();
			} else {
				c2c_sbcDisconnectTimer = setTimeout(() => {
					// c2c_ac_log('The time interval between the end of the call and SBC disconnection is over');
                    console.log('The time interval between the end of the call and SBC disconnection is over')
					c2c_phone.deinit();
				}, c2c_sbcDisconnectDelay * 1000);
			}

			c2c_gui_phoneBeforeCall();

            c2c_remoteAudio.srcObject = null;

        },
        callConfirmed: function(call, message, cause) { 
            // c2c_activeCall = true
            c2c_callButtonText.innerHTML = 'Hangup';
			c2c_callButton.classList.add("active-call");
			c2c_muteButton.style.display = 'inline-block';
			c2c_dtmfKeypad.style.display = 'grid';
        },
        callShowStreams: function(call, localStream, remoteStream) {
            console.log('show streams');
			c2c_audioPlayer.stop();
			c2c_remoteAudio.srcObject = remoteStream;

        },
        incomingCall: function(call, invite) { console.log('incoming call') },
        callHoldStateChanged(call, isHold, isRemote){ console.log('call state changed') }
    })

    c2c_sbcDisconnectCounter = 0;
    
    // additonal settings to apply beforre phone starts
    c2c_phone.setNetworkPriority(c2c_config.networkPriority);

    // connect to SBC
    c2c_phone.init(false);
}

async function c2c_sbc_connect_sequence() {
	if(c2c_phone.getOS() === 'windows'){
		await c2c_selectDevices();
	}
	c2c_initStack({ user: caller, displayName: callerDn, password: '' });
	
}

// make call
async function makeCall(callTo, extraHeaders = []) {
    
    extraHeaders.push(`X-WebRTC-Customer: ${xCustomerHeader}`);
    extraHeaders.push(`X-WebRTC-Service: ${xServiceHeader}`);
    c2c_activeCall = c2c_phone.call(c2c_phone.AUDIO, callTo, extraHeaders);
    c2c_callButtonText.innerHTML = 'Trying/Hangup'

}

// hangup or cancel clicked
async function cancelClicked() {
	// if active call hangup and return
    if (c2c_activeCall) {
        await c2c_hangupCall();
        return;
    }

	if (!c2c_activeCall) {
        makeCall(callTo);
    }

}

// hangup call
function c2c_hangupCall() {
	if (c2c_activeCall !== null) {
		c2c_activeCall.terminate();
		c2c_activeCall = null;
	}
}

// mute/unmute
function toggleMute() {
	let muted = c2c_activeCall.isAudioMuted()
	c2c_activeCall.muteAudio(!muted)
	c2c_muteButton.innerHTML = !muted ? '🔇Unmute' : '🔈Mute';
}

// send DTMF
function c2c_sendDtmf(key) {
	if (c2c_activeCall) {
		key = key.replace("dtmf-", "");
		c2c_audioPlayer.play(Object.assign({ 'name': key }, c2c_soundConfig.play.dtmf));
		c2c_activeCall.sendDTMF(key);
	}
}

// reset webpage to no call scenario
function c2c_gui_phoneBeforeCall() {
	c2c_callButtonText.innerHTML = 'Call';
	c2c_callButton.classList.remove("active-call");
	c2c_muteButton.innerHTML = '🔈mute';
	c2c_muteButton.style.display = 'none';
	c2c_dtmfKeypad.style.display = 'none';
	makeCall();
}

// select devices
function c2c_selectDevices() {
	c2c_ac_log('c2c_selectDevices()');
	showDeviceDialog();
	document.getElementById('select_devices_done_btn').onclick = c2c_selectDevicesDone;
	c2c_devices.enumerate(true)
		.catch((e) => {
			c2c_ac_log('getUserMedia() exception', e);
		})
		.finally(() => {
			for (let name of c2c_devices.names) {
				c2c_fillDeviceList(name);
			}
		});
}

// populate devices on webpage in select devices dialog
function c2c_fillDeviceList(name) {
	let device = c2c_devices.getDevice(name); // name is one of 'microphone', 'speaker', 'camera', 'ringer'
	console.log('device: ', device)
	let selector = document.querySelector(`#c2c_devices [name=${name}]`);
	// Clear select push-down list
	while (selector.firstChild) {
		selector.removeChild(selector.firstChild);
	}
	if (device.incomplete) {
		selector.disabled = true;
		c2c_ac_log(`Warning: To device selection let enable ${name} usage`);
	} else {
		selector.disabled = false;
	}
	// Loop by device labels and add option elements.
	for (let ix = 0; ix < device.list.length; ix++) {
		let dev = device.list[ix]
		let option = document.createElement("option");
		option.text = dev.label;      // device name
		option.value = ix.toString(); // index in device list
		option.selected = (device.index === ix); // selected device
		selector.add(option);
	}

	document.getElementById(`${name}_dev`).style.display = (device.list.length > 1) ? 'block' : 'none';
}

// when done is clicked on the select devices dialog on webpage
function c2c_selectDevicesDone() {
	for (let name of c2c_devices.names) {
		let selectElement = document.querySelector(`#c2c_devices [name=${name}]`);
		let index = selectElement.selectedIndex;
		if (index !== -1) { // -1 indicates that no element is selected
			let n = selectElement.options[index].value;
			c2c_devices.setSelectedIndex(name, parseInt(n));
		}
	}

	let selectedDevices = c2c_devices.store();

	// To restore after page reload.
	sessionStorage.setItem('c2c_selectedDevices', JSON.stringify(selectedDevices));

	let str = 'Devices done: selected';
	for (let name of c2c_devices.names) {
		if (c2c_devices.getNumber(name) > 1) {
			str += `\n${name}: "${c2c_devices.getSelected(name).label}"`;
		}
	}
	c2c_ac_log(str);

	let micId = c2c_devices.getSelected('microphone').deviceId;
	c2c_phone.setConstraint('audio', 'deviceId', micId);

	let spkrId = c2c_devices.getSelected('speaker').deviceId;
	c2c_audioPlayer.setSpeakerId(spkrId);

	c2c_gui_phoneBeforeCall();

	//make call
	makeCall(callTo);
}

// show select devices dialog
function showDeviceDialog() {
  if (!c2c_devicesDialog.open) {
    c2c_devicesDialog.showModal();
  }
}

// hide select devices dialog
function hideDeviceDialog() {
  if (c2c_devicesDialog.open) {
    c2c_devicesDialog.close();
  }
}

// When page loads
c2c_init();
