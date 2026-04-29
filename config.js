let SoundConfig = {
    generateTones: {
        // Phone ringing, busy and other tones vary in different countries.
        // Please see: https://www.itu.int/ITU-T/inr/forms/files/tones-0203.pdf
        
        /* Great Britain */
        ringingTone: [{ f: [400, 450], t: 0.4 }, { t: 0.2 }, { f: [400, 450], t: 0.4 }, { t: 2.0 }],
        busyTone: [{ f: 400, t: 0.375 }, { t: 0.375 }],
        disconnectTone: [{ f: 400, t: 0.375 }, { t: 0.375 }],
        autoAnswerTone: [{ f: 400, t: 0.3 }],

         /* keep alive unaudible sound */
         keepAliveTone: [{f: 20000, t: 0.1}]
    },
    downloadSounds: [
        { ring: 'ring1' },   // incoming call sound.
        'bell'
    ],
    play: {
        outgoingCallProgress: { name: 'ringingTone', loop: true, volume: 0.2 },
        busy: { name: 'busyTone', volume: 0.2, repeat: 4 },
        disconnect: { name: 'disconnectTone', volume: 0.2, repeat: 3 },
        autoAnswer: { name: 'autoAnswerTone', volume: 0.2 },
        incomingCall: { name: 'ring', loop: true, volume: 1.0 },
        incomingMessage: { name: 'bell', volume: 1.0 },
        dtmf: { volume: 0.15 },
        keepAliveBeep: { name: 'keepAliveTone', volue: 0.01 }
    },
    version: '24-Apr-2026'
}
