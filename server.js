const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/get-ws-endpoint', (req, res) => {
  res.json({ endpoint: process.env.WS_ENDPOINT });
});


app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});
