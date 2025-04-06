# CODE:
```javascript
const ENDPOINT = 'https://<awesomeID>.execute-api.ap-southeast-1.amazonaws.com/production'

import {
  ApiGatewayManagementApiClient as Client,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";

const client = new Client({ endpoint: ENDPOINT });
const names = {}

const sendToOne = async (id, body) => {
  try {
    const command = new PostToConnectionCommand({
      ConnectionId: id,
      Data: Buffer.from(JSON.stringify(body))
    });
    console.log("📤 Sending to one:", id, body);
    await client.send(command);
  } catch (err) {
    console.log("❌ Error sending to one:", err);
  }
};

const sendToAll = async (ids, body) =>{
  const all = ids.map(i => sendToOne(i, body));
  return Promise.all(all);
}

const test = async (event) => {
  console.log("🔍 EVENT:", JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from socket!" } + 'heyy')
  };
};

export const handler = async (event) => {
  console.log("Incoming Event:", JSON.stringify(event));
  // first we will need info about the request
  // which will be in the request context
  let result = {
    statusCode: 200,
    body: JSON.stringify('Hello from chubs!')
  };

  if(event.requestContext){
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    //will countain one of the routes that we defined
    let body = {}
    try{
      if(event.body){
        body = JSON.parse(event.body);
        //has stringified json
      }
    }catch(err){
      console.log("Error parsing body: ", err);
    }

    // 6 cases for 6 routes
    switch(routeKey){
      case "$connect":
        break;

      case "$disconnect":
        await sendToAll(Object.keys(names), { systemMessage: `${names[connectionId]} has left the chat` });
        console.log("👋 Disconnected: ", connectionId)
        delete names[connectionId]
        await sendToAll(Object.keys(names), {members: Object.values(names)});
        break;

      case "$default":
        break;

      case "setName":
        names[connectionId] = body.name;
        await sendToAll(Object.keys(names), {members: Object.values(names)});
        await sendToAll(Object.keys(names), {systemMessage: `${names[connectionId]} has joined the chat`});
        console.log("name as been setted")
        break;

      case "sendPublic":
        await sendToAll( Object.keys(names), {publicMessage : `${names[connectionId]}: ${body.message}`});
        console.log("public message sent")
        break;

      case "sendPrivate":
        //finding connection id of recipient
        const to = Object.keys(names).find(key => names[key] === body.to);
        await sendToOne(to, { privateMessage : `${names[connectionId]}: ${body.message}` });
        console.log("private message sent")
       break;

      default:
        console.log("Unknown route key: ", routeKey);
    }
  }
  // TODO implement
  const response = {
    statusCode: 200,
    body: JSON.stringify('Hello from chubs!'),
  };
  return result;
};
```

### 🔗 Endpoint and API Client Setup

```js
const ENDPOINT = 'https://<your-api-id>.execute-api.<region>.amazonaws.com/production';
```

- This is the WebSocket endpoint provided by API Gateway.

```js
import { ApiGatewayManagementApiClient as Client, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
const client = new Client({ endpoint: ENDPOINT });
```

- You use AWS SDK v3 to send messages back to connected clients via WebSocket.
    
---
### 🧠 In-Memory Store for Names

```js
const names = {};
```

- Stores `connectionId → name` mapping.
    
- Only works during the current Lambda execution (not persisted).
    
---
### 📤 Send Message to One Client

```js
const sendToOne = async (id, body) => {...};
```

- Sends a JSON message to a single WebSocket client using their connection ID.
    
---
### 📢 Broadcast Message to All

```js
const sendToAll = async (ids, body) => {...};
```

- Sends the same message to all connection IDs (basically all users).
    
---
### 🚪 Lambda Handler Entry Point

```js
export const handler = async (event) => {...};
```

- Main function that handles all WebSocket events.
- Based on `event.requestContext.routeKey`, it performs different actions.
    
---

### 📦 Parsing Event Details

```js
const connectionId = event.requestContext.connectionId;
const routeKey = event.requestContext.routeKey;
```

- Get current user's connection ID and which route triggered this event.
    

---

### 🔍 Parsing Incoming Message

```js
if(event.body){ body = JSON.parse(event.body); }
```

- Incoming messages from clients are stringified JSON. Parse it before using.
    

---
### 📶 Route Handlers

#### `$connect`
- Triggered when a new client connects.
- (Currently does nothing)

#### `$disconnect`
- Triggered when a user leaves.
- Broadcasts that they left and updates the member list.
#### `setName`
- Stores the user's chosen name.
- Broadcasts updated members and welcome message.
#### `sendPublic`
- Sends a message from one user to **all** users.
#### `sendPrivate`
- Finds recipient by name and sends them a private message.
#### `$default`
- Catch-all for any unexpected route.
    

---

### ✅ Final Lambda Response

```js
return {
  statusCode: 200,
  body: JSON.stringify('Hello from chubs!')
};
```

- Required by AWS even for WebSocket events.
    
---


# Frontend Script:

```javascript
let socket = null;
let username = "";

  
// get websocket url using CORS
fetch('/get-ws-endpoint')
  .then(res => res.json())
  .then(data => {
    console.log("fetched za endpoint:", data); 
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


// on message
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
  
  // bolding the name with strong tag
  const colonIndex = msg.indexOf(":");
  if (colonIndex > 0) {
    const namePart = msg.slice(0, colonIndex).trim();
    const messagePart = msg.slice(colonIndex + 1).trim();
    const strong = document.createElement("strong");

    strong.textContent = namePart + ": ";

    const span = document.createElement("span");
    span.textContent = messagePart;

    p.appendChild(strong);
    p.appendChild(span);

  } else {
    p.textContent = msg;
  }

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

// actually appending the message
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
```

---

# How mapping takes place between frontend and backend code 

## WebSocket Chat App: Mapping Between Frontend & Backend
### 1. **Initial Connection (`$connect`)**
- **Frontend:**

```js
function connectSocket(endpoint) {
  const socket = new WebSocket(endpoint);
  // Other socket setup logic...
}
```

- **Backend:**
```js
case "$connect": {
  console.log("Connected:", connectionId);
  break;
}
```

---

### 2. **Disconnection (`$disconnect`)**

- **Frontend:**
```js
disconnectBtn.onclick = () => {
  socket.close();
};
```

- **Backend:**
```js
case "$disconnect": {
  const name = names[connectionId];
  delete names[connectionId];
  await sendToAll(Object.keys(names), { systemMessage: `${name} has left the chat` });
  await sendToAll(Object.keys(names), { members: Object.values(names) });
  break;
}
```

---

### 3. **Set Username (`setName`)**

- **Frontend:**

```js
setNameBtn.onclick = () => {
  socket.send(JSON.stringify({ action: "setName", name: username }));
};
```

- **Backend:**
```js
case "setName": {
  names[connectionId] = body.name;
  await sendToAll(Object.keys(names), { systemMessage: `${body.name} has joined the chat` });
  await sendToAll(Object.keys(names), { members: Object.values(names) });
  break;
}
```

---
### 4. **Send Public Message (`sendPublic`)**

- **Frontend:**
```js
sendBtn.onclick = () => {
  if (!recipientInput.value) {
    socket.send(JSON.stringify({ action: "sendPublic", message: messageInput.value }));
  }
};
```

- **Backend:**
```js
case "sendPublic": {
  const msg = `${names[connectionId]}: ${body.message}`;
  await sendToAll(Object.keys(names), { publicMessage: msg });
  break;
}
```

---
### 5. **Send Private Message (`sendPrivate`)**

- **Frontend:**
    
```js
sendBtn.onclick = () => {
  if (recipientInput.value) {
    socket.send(JSON.stringify({ action: "sendPrivate", to: recipientInput.value, message: messageInput.value }));
  }
};
```

- **Backend:**

```js
case "sendPrivate": {
  const to = Object.keys(names).find(key => names[key] === body.to);
  if (to) {
    const msg = `${names[connectionId]}: ${body.message}`;
    await sendToOne(to, { privateMessage: msg });
  }
  break;
}
```

---

### 6. **Message Handling in Frontend**

```js
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.systemMessage) appendMessage(`[System] ${data.systemMessage}`, "system");
  if (data.publicMessage) appendMessage(data.publicMessage, "public");
  if (data.privateMessage) appendMessage(`[Private] ${data.privateMessage}`, "private");
  if (data.members) updateMembers(data.members);
};
```

---

### 7. **Lambda Helpers**

- `sendToOne(connectionId, body)`:

```js
const command = new PostToConnectionCommand({
  ConnectionId: connectionId,
  Data: Buffer.from(JSON.stringify(body)),
});
await apiGateway.send(command);
```

- `sendToAll(ids, body)`:

```js
await Promise.all(
  ids.map(id => sendToOne(id, body))
);
```

---

### 8. **Common Mistakes Resolved**

- `action` field from frontend **must match** route keys in API Gateway.
- AWS WebSocket route keys like `sendPublic` must be mapped correctly —

```js
case "$default": {
  console.log("Unknown route key", event.requestContext.routeKey);
  break;
}
```

---
### Summary: Trigger Flow Example

- **User joins:**
```js
socket.send({ action: "setName", name: "Alice" });
```

```js
names[connectionId] = "Alice";
await sendToAll(...);
```

- **User sends public message:**
```js
socket.send({ action: "sendPublic", message: "hello!" });
```

```js
await sendToAll(..., { publicMessage: "Alice: hello!" });
```

- **User sends private message:**

```js
socket.send({ action: "sendPrivate", to: "Bob", message: "hi!" });
```

```js
const to = Object.keys(names).find(key => names[key] === "Bob");
await sendToOne(to, { privateMessage: "Alice: hi!" });
```

---
