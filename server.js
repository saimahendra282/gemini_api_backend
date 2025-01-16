const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
const PORT = 5000;

// Set up multer to store files temporarily
const upload = multer({ dest: "uploads/" });

const apiKey = process.env.GEMINI_API_KEY || "UWU";
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// app.use(cors());
const corsOptions = {
    origin: ['http://localhost:3000','https://geminisai1.netlify.app'], // Allow requests only from these two origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], // Allowed HTTP methods
    credentials: true // Allow credentials (e.g., cookies, authorization headers)
};
// const corsOptions = {
//     origin: '*', // Allow requests from any origin
//     methods: ['GET', 'POST','PUT','PATCH','DELETE'],
//     credentials: true
// };
app.use(cors(corsOptions));
app.use(bodyParser.json());

// POST route for analyzing video
app.post("/analyze-video", upload.single("video"), async (req, res) => {
  const { file, body } = req;
  const { question } = body;

  // Check if file is uploaded
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Create the full file path
    const filePath = path.join(__dirname, file.path);

    // Upload the video file to Gemini
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType: file.mimetype,
      displayName: file.originalname,
    });
    console.log(`Uploaded file ${uploadResult.file.name}`);

    let uploadedFile = await fileManager.getFile(uploadResult.file.name);
    while (uploadedFile.state === "PROCESSING") {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      uploadedFile = await fileManager.getFile(uploadResult.file.name);
    }

    if (uploadedFile.state !== "ACTIVE") {
      throw new Error(`File processing failed for ${uploadedFile.name}`);
    }
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: "Your name is Neko. Cute japaneese cat girl, keep responses expressive and concise",
      });
    // const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" ,systemInstruction: "You are a cat. Your name is Neko.",});
    const chatSession = model.startChat({
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      },
      history: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType: uploadedFile.mimeType,
                fileUri: uploadedFile.uri,
              },
            },
          ],
        },
        {
          role: "user",
          parts: [{ text: question }],
        },
      ],
    });

    const result = await chatSession.sendMessage(question);
    res.json({ response: result.response.text() });

    // Optional: Delete the uploaded file after processing
    fs.unlinkSync(filePath); // Delete the file from the server
  } catch (error) {
    console.error("Error interacting with Gemini API:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
