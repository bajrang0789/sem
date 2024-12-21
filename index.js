// Smart Expense Manager: Node.js Backend Code with Google Cloud Functions

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const { Firestore } = require('@google-cloud/firestore');
const { Storage } = require('@google-cloud/storage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

// Validate GEMINI_API_KEY
if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
}
if (process.env.GEMINI_API_KEY.length < 8) {
    console.error('GEMINI_API_KEY is too short.');
    process.exit(1);
}
// Masking the Key in Logs
const maskedKey = process.env.GEMINI_API_KEY.slice(0, 4) + '...' + process.env.GEMINI_API_KEY.slice(-4);
console.log('Using GEMINI_API_KEY:', maskedKey);

// Initialize Firestore and Storage
const firestore = new Firestore();
const storage = new Storage();

// Assuming you have your API key in an environment variable
const apiKey = process.env.GEMINI_API_KEY;

// Initialize the Gemini API client with your API key
const genAI = new GoogleGenerativeAI(apiKey);

// Multer configuration for file uploads
const upload = multer({ dest: 'uploads/' });

// Dynamic bucket configuration
const bucketName = process.env.GCS_BUCKET_NAME || 'sem-gcp-demo';

// Endpoint to upload receipt and process with Generative AI
app.post('/upload-receipt', upload.single('file'), async (req, res) => {
    console.log('Received request to /upload-receipt with body:', req.body);
    console.log('Received file:', req.file);

    const { fileName } = req.body;
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;


    try {
        // Validate bucket name and permissions
        if (!bucketName) {
            console.error('Bucket name is not configured.');
            return res.status(500).json({ error: 'Bucket name is not configured.' });
        }

        console.log(`Checking access permissions for bucket: ${bucketName}`);
        try {
            await storage.bucket(bucketName).getMetadata();
            console.log(`Access to bucket ${bucketName} is valid.`);
        } catch (permissionError) {
            console.error(`Insufficient permissions for bucket: ${bucketName}`, permissionError);
            return res.status(500).json({ error: `Insufficient permissions for bucket: ${bucketName}` });
        }

        // Upload file to Google Cloud Storage
        const uniqueFileName = `${uuidv4()}-${fileName}`;
        console.log(`Uploading file ${fileName} to bucket ${bucketName} as ${uniqueFileName}`);
        await storage.bucket(bucketName).upload(filePath, {
            destination: uniqueFileName,
        });

        console.log(`File ${uniqueFileName} uploaded to ${bucketName}`);
        const imageUri = `gs://${bucketName}/${uniqueFileName}`;

        // Process the receipt using Generative AI
        console.log(`Processing file with Generative AI: ${imageUri}`);

        // Validate the model name is correct and accessible
        let model;
        try {
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });
            console.log("Model 'gemini-1.5-flash-002' validated successfully.");
        } catch (error) {
            console.error("Failed to validate model 'gemini-1.5-flash-002':", error);
            return res.status(500).json({ error: "Invalid or inaccessible model name." });
        }

        // Need to refine later TODO
        // Fetch the image data from GCS
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(uniqueFileName);
        const [imageBuffer] = await file.download();

        // Convert image data to base64
        const base64Image = imageBuffer.toString('base64');

         const imagePart = {
             inlineData: {
                 mimeType: mimeType,  // Update this based on your image type
                 data: base64Image
             }
         };

         const prompt = "Extract key details from this receipt image, ensure there are only 3 keys as [ description, amount and date] Any additional detail should be under the description key. Do not highlight or BOLD any outputs and prefereably post response in lowercase and omit any Not available or missing data information" ;

        let response;
        try {
            // Generate content, providing image part
            const result = await model.generateContent([
                prompt,
                imagePart,
               ]);
               response = result.response;
        } catch (aiError) {
            console.error('Error from Generative AI:', aiError);
            return res.status(500).json({ error: 'Failed to process receipt with AI' });
        }

        const aiOutput = response.text() || 'No output generated';
        console.log('Received AI output:', aiOutput);

        // Parse AI response (adjust parsing logic as needed)
        const parsedData = parseGenerativeAIResponse(aiOutput);
        const { description, date, amount } = parsedData;

        // Categorize the expense on-the-fly
        console.log('Categorizing expense with description:', description);
        const category = categorizeExpense(parsedData);

        // Save data to Firestore
        const expenseRecord = {
            description,
            date,
            amount,
            category,
            imagePath: `gs://${bucketName}/${uniqueFileName}`,
            createdAt: new Date(),
        };
        console.log('Saving expense record to Firestore:', expenseRecord);
        try {
            await firestore.collection('expenses').add(expenseRecord);
        } catch (firestoreError) {
            console.error('Error Saving to firestore', firestoreError);
            return res.status(500).json({ error: 'Failed to process and save to firestore' });
        }
        // Clean up temporary file
        try {

            await fs.promises.unlink(filePath);
            console.log(`Temporary file ${filePath} deleted successfully.`);
        } catch (unlinkError) {
            console.error(`Error deleting temporary file ${filePath}:`, unlinkError);
        }

        res.status(200).json({
            message: 'Receipt processed successfully',
            data: expenseRecord,
        });
    } catch (error) {
        console.error('Error processing receipt:', error);
        res.status(500).json({ error: 'Failed to process receipt' });
    }
});

// Parse Generative AI response
function parseGenerativeAIResponse(aiOutput) {
    console.log('Parsing AI output:', aiOutput);

    // Initialize the return object with default values
    const parsedData = {
       description: "Unknown",
       date: "Unknown",
       amount: 0
    };

    try {
      const lines = aiOutput.split('\n');

      for (const line of lines) {
        // Use regex for flexible matching and capturing the value
        const descriptionMatch = line.match(/description:\s*(.*)/i);
          if (descriptionMatch) {
            parsedData.description = descriptionMatch[1].trim();
        }
        const dateMatch = line.match(/date:\s*(.*)/i);
        if (dateMatch) {
          parsedData.date = dateMatch[1].trim();
        }

        const amountMatch = line.match(/(amount|total amount):\s*([\d.]+)/i);
        if (amountMatch) {
            const amountValue = parseFloat(amountMatch[2]); // Capture group 2
            parsedData.amount = isNaN(amountValue) ? 0 : amountValue;
          }
        }

       return parsedData;
    } catch (parseError) {
        console.error('Error parsing AI output:', parseError);
          return { description: "Unknown", date: "Unknown", amount: 0 };
    }
}

// Categorize expense dynamically
function categorizeExpense(parsedData) {
    console.log('Categorizing parsed data:', parsedData);

  const categories = {
        travel: ['flight', 'hotel', 'cab'],
        food: ['restaurant', 'grocery', 'coffee'],
        office: ['supplies', 'software', 'furniture'],
        fuel: ['petrol', 'diesel', 'gas'],
    };

   // Check if parsedData exists and has a description property
    if (!parsedData || !parsedData.description) {
        console.log('Parsed data or description is missing. Defaulting to miscellaneous.');
        return 'miscellaneous';
    }

    const description = parsedData.description;

    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => description.toLowerCase().includes(keyword))) {
            console.log(`Matched category: ${category} for description: ${description}`);
            return category;
        }
    }

    console.log('No matching category found. Defaulting to miscellaneous.');
    return 'miscellaneous';
}

// Endpoint to fetch categorized expenses
app.get('/expenses', async (req, res) => {
    console.log('Received request to /expenses');
    try {
        const snapshot = await firestore.collection('expenses').get();
        const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log('Fetched expenses:', expenses);
        res.status(200).json(expenses);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

// Error handling middleware for 500 errors
app.use((err, req, res, next) => {
    // console.error('Server error:', err);
    console.error('Server error:', { message: err.message, stack: err.stack });
    res.status(500).sendFile(path.join(__dirname, 'public', 'custom_50x.html'));
    // res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
});

// UI for file upload
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Upload Receipt</title>
        </head>
        <body>
            <h1>Upload Receipt</h1>
            <form id="uploadForm" enctype="multipart/form-data" method="POST" action="/upload-receipt">
                <input type="file" name="file" id="fileInput" /><br/><br/>
                <input type="text" name="fileName" id="fileName" placeholder="Enter file name" /><br/><br/>
                <button type="submit">Upload</button>
            </form>
        </body>
        </html>
    `);
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
