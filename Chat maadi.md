### WebSocket Chat App Setup Notes (AWS Lambda + API Gateway)

The main idea is to use AWS API Gateway's WebSocket support to manage persistent connections, and use a Lambda function as the backend handler for all events.

#### API Gateway WebSocket Setup

- **WebSocket API Created**  
    Used API Gateway (WebSocket type) to set up real-time communication for the chat app. This allows clients to maintain an open connection with the server for bi-directional messaging.
    
- **Routes Selection Expressions**  
    Created the following routes for different types of messages and events:
    - `$connect`: Triggered when a client connects to the WebSocket server.
    - `$disconnect`: Triggered when a client disconnects.
    - `$default`: Called when a message doesn’t match any of the defined routes.
    - `sendPublic`: Used to send messages to all connected clients.
    - `sendPrivate`: Used to send a message to a specific connection ID (private chat).
    - `setName`: Allows clients to set a display name associated with their connection.
        
- **Single Lambda Function (chat-api-handler)**  
    All the above routes are integrated with one common Lambda function (`chat-api-handler`). This function handles the logic for each route by checking the `routeKey` in the event. It keeps the setup simple and centralizes logic, making it easier to manage and deploy.
    
- **Stage Created: `production`**  
    A deployment stage named `production` was created to deploy and test the WebSocket API. This is the URL that clients will use to connect.
    

#### WebSocket and Connection URLs

- **WebSocket URL**  
    This is the main endpoint used by clients to establish a WebSocket connection to the API. Format looks like:
    `wss://<api-id>.execute-api.<region>.amazonaws.com/production`
    
    This is what you'll use in your front-end (e.g., with `new WebSocket(...)`) to connect to your chat server.
    
- **Connection URL (Not the same as WebSocket URL)**  
    This isn’t used by the client directly. Internally, in the Lambda function, I can use the API Gateway management API to send messages to specific connected clients. It's mainly used when sending private messages or disconnecting a client programmatically.


When we post to to the connection URL with connection ID as argument, private message will be sent to that connection ID fellow.
#### Why This Setup?

- Using WebSockets allows real-time communication between clients and server without needing to poll for updates.
    
- Offloading routing and connection management to API Gateway simplifies infrastructure.
    
- Using Lambda keeps the backend serverless, scalable, and low-maintenance.
    
- The single Lambda function approach works fine at early stages; might split routes later if needed for performance or clarity.

---


### WebSocket Logging & Route Debugging 

- Initially, when I connected using `wscat`, the **Lambda wasn’t logging anything**. CloudWatch had no logs showing up, even though I had `console.log()` statements.
    
- Before all that, the **first major issue** I ran into was a **502 Internal Server Error**. That was because the YT tutorial I was following was using **CommonJS module syntax (`module.exports`)** instead of the required **ES module syntax (`export`)**. After updating the code to use ES modules properly, the 502 error disappeared, but the logs still didn’t show up.
    
- I then tried sending requests using `wscat` to test routes like this:
    ```bash
     `wscat -c wss://<your-api-id>.execute-api.<region>.amazonaws.com/production > {"action":"sendPublic","message":"hello world"}    
```
   
    - But nothing happened. No logs, no visible output, no errors

Then, to understand what was really the problem, I learnt to enable  CloudWatch logging under the **Logs/Tracing** section in API Gateway. I thought it was set up properly because I ticked the "Enable CloudWatch Logs" checkbox and saved the changes. But even after that, **no logs were appearing** when I triggered my Lambda via `wscat`.

I also double-checked my Lambda function to ensure it had the necessary `console.log()` statements for debugging. But again, nothing came through in CloudWatch Logs. That's when I realized something deeper was missing in the logging setup.

- I added `console.log("Incoming Event:", JSON.stringify(event));` to debug the incoming event in my Lambda. Still, **nothing appeared in CloudWatch**. That’s when I figured something deeper was wrong.
    
- Eventually, I saw the message:  
    **“CloudWatch Logs role ARN must be set in account settings to enable logging.”**
    
    So I did the following:
    - Went to **API Gateway → Stages → production → Logs/Tracing**.
    - Enabled **“Enable CloudWatch Logs”** and chose **“INFO” level**.
    - Assigned the **IAM role** with the policy `AmazonAPIGatewayPushToCloudWatchLogs`.
        
- Once the logs started coming in, I spotted this error:
    
    `Unknown route key: sendPublic`
    
    - That’s when I realized: in API Gateway WebSocket routes, **route keys must start with a `$`**.
    - So I updated my wscat request to:
        
        `> {"action":"$sendPublic","message":"hello world"}`
        
    - After that, the **Lambda function executed properly**, and I finally saw the correct logs in CloudWatch, including my `console.log()` output.
        
- Even before fixing the `$`, the logs showed **HTTP 200 status**, which was misleading because the function wasn’t actually doing what I expected.

---


## 🧪 Testing WebSocket Commands in CMD using `wscat`

After I deployed my WebSocket API using AWS API Gateway and Lambda, I used `wscat` to test the WebSocket connection and routes from the **Command Prompt**. Here's exactly how I did it:

---

#### 1️. Installed `wscat` 

To begin, I made sure `wscat` was installed globally on my system using Node.js:

`npm install -g wscat`

---

#### 2️. Connected to the WebSocket Endpoint

Once I had my WebSocket API Gateway URL (e.g., `wss://<api-id>.execute-api.<region>.amazonaws.com/production`), I connected to it like this:

`wscat -c wss://<api-id>.execute-api.<region>.amazonaws.com/production`

If the connection was successful, I saw output like:

`Connected (press CTRL+C to quit) >`

This meant I was inside the WebSocket session and could now send/receive JSON messages.

---

#### 3️. Sent a Public Message (Initial Attempt – Didn't Work)

At first, I tried sending a message like this (note: this version was **incorrect**):

`> {"action":"sendPublic","message":"hello world"}`

But **nothing happened**—no logs in CloudWatch, no response in the terminal, and no errors. This was confusing at first because the WebSocket stayed connected and there were no visible issues.

---

#### 4️. Discovered Route Key Format Issue

After some debugging and checking CloudWatch logs (once they finally started working), I saw the error:

`Unknown route key: sendPublic`

That’s when I realized that **API Gateway WebSocket routes must be defined with a `$` prefix** in the `action` field.

---
#### 5️. Corrected the Request with `$` Prefix

So I updated my command to:

`> {"action":"$sendPublic","message":"hello world"}`

This time, it worked correctly:

- The **Lambda function executed**.
- I saw the **logs in CloudWatch**.
- If my Lambda returned a message, it appeared in the terminal as well.

---

#### 6️. Sent a Private Message

Similarly, to test sending a private message, I ran:

`> {"action":"$sendPrivate","to":"<username>","message":"this is a secret!"}`

Of course, I made sure the target user was already connected and had set their name via the `"setName"` route.

---

#### 7️. Set My Username

To set my own name, I used:

`> {"action":"$setName","name":"chubs"}`

This helped register my identity on the server and made private messaging and member list updates possible.

---

#### 8️. Observed Output in CMD and CloudWatch

After sending each message:

- I checked the **CMD output** for any server responses.
    
- I viewed the **CloudWatch logs** to see what my Lambda was receiving (`event.body`, connection ID, etc.).

---

# 🧠 How WebSocket Routing Works in AWS API Gateway

This document breaks down how AWS WebSocket API maps frontend WebSocket events to backend Lambda functions.

---
### ✨ Overview
- AWS WebSocket API is event-driven.
- You define **route keys** like `$connect`, `sendPublic`, `$disconnect`, etc.
- API Gateway maps incoming WebSocket messages to these route keys using an **expression**.
- These routes invoke your Lambda function with appropriate metadata.

---
### ✅ 1. Frontend Connects

```js
const socket = new WebSocket("wss://your-api-id.execute-api.region.amazonaws.com/dev");
```

- Sends WebSocket **handshake** to API Gateway.
    
- API Gateway triggers the **`$connect` route**.
    
- Lambda receives an event like:
    

```json
{
  "requestContext": {
    "routeKey": "$connect",
    "connectionId": "abc123"
  }
}
```

---

### 🔁 2. Backend Handles `$connect`

```js
case "$connect":
  console.log("New connection:", connectionId);
  break;
```

- You can store the connection ID, log it, or set up user state.
    

---

### ✅ 3. Frontend Sends Message

```js
socket.send(JSON.stringify({ action: "sendPublic", message: "hi there" }));
```

- API Gateway uses **Route Selection Expression**:
    
    ```
    $request.body.action
    ```
    
- `action: "sendPublic"` triggers the **`sendPublic` route**.
    

Lambda receives:

```json
{
  "requestContext": {
    "routeKey": "sendPublic",
    "connectionId": "abc123"
  },
  "body": "{\"action\":\"sendPublic\",\"message\":\"hi there\"}"
}
```

---

### ❌ 4. Socket Closes

```js
socket.close();
```

- Or the browser tab is closed.
    
- API Gateway triggers **`$disconnect` route**.
    

Lambda receives:

```json
{
  "requestContext": {
    "routeKey": "$disconnect",
    "connectionId": "abc123"
  }
}
```

You handle:

```js
case "$disconnect":
  delete names[connectionId];
  broadcast("User left");
  break;
```

---

### 🔍 Why Does `action` Work Automatically?

Because you set **Route Selection Expression** to:

```
$request.body.action
```

So API Gateway reads the message body, finds the `action` field, and uses that as the route key.

---

### ⚙ Route Mappings

You define these in API Gateway:

|Route Key|Lambda Target|
|---|---|
|`$connect`|`handleChat`|
|`$disconnect`|`handleChat`|
|`sendPublic`|`handleChat`|
|`setName`|`handleChat`|

Your Lambda uses:

```js
switch (event.requestContext.routeKey) {
  case "$connect": ...
  case "$disconnect": ...
  case "sendPublic": ...
  case "setName": ...
}
```

---

### 🔢 Summary

- WebSocket opens → `$connect` runs.
    
- `socket.send({action: "sendPublic"})` → `sendPublic` route runs.
    
- `socket.close()` → `$disconnect` runs.
    
- You define all routes in API Gateway.
    
- API Gateway parses `action` field to determine the route.
    

---

Let me know if you want this explained with a diagram!

