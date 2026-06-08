let c2c_config = {
    //phone settings
    networkPriority: 'high', // RTP packet marking: undefined (don't change) or 'high' (CS7), 'medium', 'low', 'very-low'. only supported in Chrome.
    selectDevicesEnabled: true, // controls if the user can select devices
}

let c2c_soundConfig = {
    generateTones: {
        // Phone ringing, busy and other tones vary in different countries.
        // Please see: https://www.itu.int/ITU-T/inr/forms/files/tones-0203.pdf
        /* Great Britain */
        ringingTone: [{ f: [400, 450], t: 0.4 }, { t: 0.2 }, { f: [400, 450], t: 0.4 }, { t: 2.0 }],
        busyTone: [{ f: 400, t: 0.375 }, { t: 0.375 }],
        disconnectTone: [{ f: 400, t: 0.375 }, { t: 0.375 }],
        autoAnswerTone: [{ f: 400, t: 0.3 }]
    },
     play: {
        outgoingCallProgress: { name: 'ringingTone', loop: true, volume: 0.2 },
        busy: { name: 'busyTone', volume: 0.2, repeat: 4 },
        disconnect: { name: 'disconnectTone', volume: 0.2, repeat: 3 },
        dtmf: { volume: 0.15 }
     }
}
