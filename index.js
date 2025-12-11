require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const express = require('express');
const cors = require('cors');
const app =express();
const port = process.env.PORT || 5000;
app.use(express.json());
app.use(cors());
const { MongoClient, ServerApiVersion } = require('mongodb');

// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
//   'utf-8'
// )
// const serviceAccount = JSON.parse(decoded)
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// })

// Middleware JWT 
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}


const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.4ckhtis.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    await client.connect();
    const db = client.db("smartHome");
    const bookingCollection = db.collection("bookings");
    const serviceCollection = db.collection("service");
      // Booking 

      // This is for admin
      app.get("/bookings", async (req, res) => {
      const list = await bookingCollection.find().sort({ createdAt:-1 }).toArray();
      res.send({ success:true, count: list.length, data: list });
    });

    // This is for user (Find out by email);
    app.get("/bookings/user/:email", async (req, res) => {
      const email = req.params.email;
      const list = await bookingCollection.find({ email }).sort({ createdAt:-1 }).toArray();
      res.send({ success:true, count: list.length, data: list });
    });

    
    // Update Booking Status
app.patch("/bookings/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).send({ success: false, message: "status required" });
    }

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    res.send({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

      // All bookings 
     app.post("/bookings", async (req, res) => {
      try {
        const booking = req.body;
        booking.status = "pending";
        booking.createdAt = new Date();

        const result = await bookingCollection.insertOne(booking);

        res.status(201).send({
          success: true,
          message: "Booking created successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to create booking",
          error,
        });
      }
    });


    // POST: Add New Service
app.post("/services", async (req, res) => {
  try {
    const service = req.body;
    service.createdAt = new Date();

    const result = await serviceCollection.insertOne(service);

    res.status(201).send({
      success: true,
      message: "Service added successfully",
      data: result,
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to add service",
      error,
    });
  }
});


  // GET: All Services
app.get("/services", async (req, res) => {
  try {
    const services = await serviceCollection.find().toArray();

    res.send({
      success: true,
      message: "Services fetched successfully",
      data: services,
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch services",
      error,
    });
  }
});

  // Payment Stripe 
  app.post("/create-checkout-session", async (req, res) => {
  try {
    const { 
      serviceId, 
      serviceName, 
      serviceType, 
      description, 
      price, 
      userName, 
      userEmail 
    } = req.body;

    if (!serviceId || !serviceName || !price) {
      return res.status(400).send({
        success: false,
        message: "Missing required fields"
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: serviceName,
              description: `${description} | Type: ${serviceType}`,
            },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],
      // customer_email: paymentInfo?.customer?.email,
      mode: "payment",

      metadata: {
        serviceId,
        serviceName,
        serviceType,
        userName,
        userEmail,
      },

      success_url: `${process.env.CLINT_SERVER}/payment-success`,
      cancel_url: `${process.env.CLINT_SERVER}/service/${serviceId}`,
    });

    res.send({ success: true, url: session.url });

  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Stripe session creation failed",
      error: error.message,
    });
  }
});













    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
