let socket = null;
let username = "";

// get websocket url
fetch('/get-ws-endpoint')
  .then(res => res.json())
  .then(data => {
    console.log("Fetched WebSocket endpoint:", data); // 👈 Log this
    if (!data.endpoint) throw new Error("Missing endpoint in response");
    connectSocket(data.endpoint);
  })
  .catch(err => console.error("Failed to fetch WebSocket endpoint:", err));

// DOM elements
const setNameBtn = document.getElementById("setNameBtn");
const sendBtn = document.getElementById("sendBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const toInput = document.getElementById("toInput");
const chatBox = document.getElementById("chatBox");
const membersList = document.getElementById("membersList");

// Connect to WebSocket
function connectSocket(endpoint) {
  socket = new WebSocket(endpoint);

  socket.onopen = () => {
    console.log(" Connected to WebSocket");
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(" Message received:", data);

    if (data.systemMessage) appendMessage(`[System] ${data.systemMessage}`, "system");
    if (data.publicMessage) appendMessage(data.publicMessage, "public");
    if (data.privateMessage) appendMessage(`[Private] ${data.privateMessage}`, "private");
    if (data.members) updateMembers(data.members);
  };

  socket.onclose = () => {
    console.log("🔌 Disconnected from WebSocket");
    appendMessage("[System] Disconnected from server", "system");
  };

  socket.onerror = (err) => {
    console.error(" WebSocket error:", err);
  };
}

// UI: Append message to chat box
function appendMessage(msg, type = "public") {
  const p = document.createElement("p");
  p.textContent = msg;

  switch (type) {
    case "system":
      p.style.color = "gray";
      break;
    case "private":
      p.style.color = "purple";
      break;
    default:
      p.style.color = "black";
  }

  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// UI: Update member list
function updateMembers(members) {
  membersList.innerHTML = "";
  members.forEach(member => {
    const li = document.createElement("li");
    li.textContent = member;
    membersList.appendChild(li);
  });
}

// Handle name setting
setNameBtn.addEventListener("click", () => {
  const inputName = nameInput.value.trim();
  if (!inputName) return;

  username = inputName;

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket not connected yet.");
    return;
  }

  socket.send(JSON.stringify({ action: "setName", name: username }));
  appendMessage(`[System] You joined as ${username}`, "system");
});

// Send message
sendBtn.addEventListener("click", () => {
  const message = messageInput.value.trim();
  const to = toInput.value.trim();
  if (!message || !socket || socket.readyState !== WebSocket.OPEN) return;

  if (to) {
    socket.send(JSON.stringify({ action: "sendPrivate", to, message }));
    appendMessage(`[Private to ${to}] ${username}: ${message}`, "private");
  } else {
    socket.send(JSON.stringify({ action: "sendPublic", message }));
  }

  messageInput.value = "";
});

// Disconnect
disconnectBtn.addEventListener("click", () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
    appendMessage("[System] You disconnected.", "system");
  }
});
