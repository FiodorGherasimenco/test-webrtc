firebase.initializeApp({
  apiKey: "AIzaSyBoAVtVHhSjScVhrb7kwWivcROzLQVKis0",
  authDomain: "fir-rtc-37435.firebaseapp.com",
  projectId: "fir-rtc-37435",
});

mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let roomDialog = null;
let roomId = null;

function init() {
  document.querySelector("#cameraBtn").addEventListener("click", openUserMedia);
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#createBtn").addEventListener("click", createRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}

async function createRoom() {
  document.querySelector("#createBtn").disabled = true;
  const db = firebase.firestore();
  const roomRef = await db.collection("rooms").doc();

  console.log("Create PeerConnection with configuration: ", configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection("callerCandidates");

  peerConnection.addEventListener("icecandidate", (event) => {
    if (!event.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate: ", event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log("Created offer:", offer);

  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  document.querySelector(
    "#currentRoom"
  ).innerText = `Current room is ${roomRef.id} - You are the caller!`;
  // Code for creating a room above

  // Listening for remote session description below
  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log("Got remote description: ", data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  document.querySelector("#localVideo").srcObject = stream;
  localStream = stream;

  console.log("Stream:", document.querySelector("#localVideo").srcObject);
  document.querySelector("#cameraBtn").disabled = true;
  document.querySelector("#createBtn").disabled = false;
  document.querySelector("#hangupBtn").disabled = false;
}

async function hangUp(e) {
  const tracks = document.querySelector("#localVideo").srcObject.getTracks();
  tracks.forEach((track) => {
    track.stop();
  });

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector("#localVideo").srcObject = null;
  document.querySelector("#cameraBtn").disabled = false;
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#hangupBtn").disabled = true;
  document.querySelector("#currentRoom").innerText = "";

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    const calleeCandidates = await roomRef.collection("calleeCandidates").get();
    calleeCandidates.forEach(async (candidate) => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection("callerCandidates").get();
    callerCandidates.forEach(async (candidate) => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener("signalingstatechange", () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener("iceconnectionstatechange ", () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
  });
}

init();
