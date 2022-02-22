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
let remoteStream = null;
let roomDialog = null;
let roomId = null;

function init() {
  remoteStream = new MediaStream();
  document.querySelector("#remoteVideo").srcObject = remoteStream;
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}

function joinRoom() {
  document.querySelector("#confirmJoinBtn").addEventListener(
    "click",
    async () => {
      roomId = document.querySelector("#room-id").value;
      console.log("Join room: ", roomId);
      document.querySelector(
        "#currentRoom"
      ).innerText = `Current room is ${roomId} - You are the callee!`;
      await joinRoomById(roomId);
    },
    { once: true }
  );
  roomDialog.open();
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log("Got room:", roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log("Create PeerConnection with configuration: ", configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection("calleeCandidates");
    peerConnection.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    peerConnection.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStream:", track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    console.log("Got offer:", offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log("Created answer:", answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
  }
}

async function hangUp(e) {
  const tracks = document.querySelector("#localVideo").srcObject.getTracks();
  tracks.forEach((track) => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach((track) => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector("#remoteVideo").srcObject = null;
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
