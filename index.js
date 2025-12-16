require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const express = require('express');
const admin = require("firebase-admin");
const cors = require('cors');
const app =express();
const port = process.env.PORT || 5000;
app.use(express.json());
// app.use(cors());
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
}));
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
//   'utf-8'
// )
// const serviceAccount = JSON.parse(decoded)
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// })


const serviceAccount = require("./firebase-admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


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
    const paymentsCollection = db.collection("payments");
    const usersCollection =db.collection("users");
      const decoratorRequestsCollection = db.collection('decoratorRequests')

      // Booking 

      // This is for admin
      app.get("/bookings", async (req, res) => {
      const list = await bookingCollection.find().sort({ createdAt:-1 }).toArray();
      res.send({ success:true, count: list.length, data: list });
    });

    // This is for user (Find out by email);
    app.get("/bookings/user/:email",async (req, res) => {
      const email = req.params.email;
      const list = await bookingCollection.find({ email }).sort({ createdAt:-1 }).toArray();
      res.send({ success:true, count: list.length, data: list });
    });
    // This is for seller 
    app.get("/manage-decorator/:email", async (req, res) => {
      const email = req.params.email;
      const list = await bookingCollection.find({'seller.email': email }).sort({ createdAt:-1 }).toArray();
      res.send({ success:true, count: list.length, data: list });
    });

     // my Inventory 
    app.get("/my-Inventory/:email", async (req, res) => {
      const email = req.params.email;
      const list = await serviceCollection.find({'seller.email': email }).sort({ createdAt:-1 }).toArray();
      res.send({ success:true, count: list.length, data: list });
    });

    // my inventory delete 
    app.delete("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await serviceCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount > 0) {
      res.send({ success: true });
    } else {
      res.status(404).send({ success: false });
    }
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
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

      app.delete("/bookings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await bookingCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount > 0) {
        res.send({ success: true, message: "Booking deleted successfully!" });
      } else {
        res.status(404).send({ success: false, message: "Booking not found!" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).send({ success: false, message: "Deletion failed!", error: err.message });
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
      userEmail,
      bookingId 
    } = req.body;

    if (!serviceId || !serviceName || !price || !bookingId) {
      return res.status(400).send({
        success: false,
        message: "Missing required fields"
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      billing_address_collection: "auto",
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
        bookingId,
      },
      

      success_url: `${process.env.CLINT_SERVER}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
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


// app.post("/payment-success", async (req, res) => {
//   try {
//     const { sessionId } = req.body;

//     if (!sessionId) {
//       return res.status(400).send({ success: false, message: "Session ID missing" });
//     }

//     // Get Stripe session
//     const session = await stripe.checkout.sessions.retrieve(sessionId);

//     const metadata = session.metadata;

//     // Fetch booking info
//     // const booking = await bookingCollection.findOne({
//     //   serviceId: metadata.serviceId,
//     //   userEmail: metadata.userEmail
//     // });
//     const paymentExists = await paymentsCollection.findOne({
//   transactionId: session.payment_intent,
// });
//     // If session completed and booking not updated previously
//     if (session.payment_status === "paid" && !paymentExists) {
//       // Save Payment Information
//       const paymentInfo = {
//         serviceId: metadata.serviceId,
//         serviceName: metadata.serviceName,
//         serviceType: metadata.serviceType,
//         userName: metadata.userName,
//         userEmail: metadata.userEmail,
//         transactionId: session.payment_intent,
//         amount: session.amount_total / 100,
//         date: new Date(),
//         status: "paid",
//       };

//       // Insert into payments collection
//       const paymentResult = await db.collection("payments").insertOne(paymentInfo);

//       // Update Booking Status
//       await bookingCollection.updateOne(
//         { serviceId: metadata.serviceId, userEmail: metadata.userEmail },
//         { $set: { status: "paid", transactionId: session.payment_intent } }
//       );

//       return res.send({
//         success: true,
//         message: "Payment Success & Booking Updated!",
//         transactionId: session.payment_intent,
//         paymentId: paymentResult.insertedId,
//       });
//     }

//     res.send({ success: false, message: "Payment not completed" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ success: false, error: error.message });
//   }
// });
// MongoDB থেকে ObjectId ইমপোর্ট করা হয়েছে ধরে নিচ্ছি
// const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.post("/payment-success", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res
        .status(400)
        .send({ success: false, message: "Session ID missing" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata;
    const bookingId = metadata.bookingId;

    if (!bookingId) {
      return res
        .status(400)
        .send({ success: false, message: "Booking ID missing in metadata" });
    }

    const paymentExists = await paymentsCollection.findOne({
      transactionId: session.payment_intent,
    });

    if (session.payment_status === "paid" && !paymentExists) {
      const paymentInfo = {
        serviceId: metadata.serviceId,
        serviceName: metadata.serviceName,
        serviceType: metadata.serviceType,
        userName: metadata.userName,
        userEmail: metadata.userEmail,
        bookingId: bookingId,
        transactionId: session.payment_intent,
        amount: session.amount_total / 100,
        date: new Date(),
        status: "paid",
      };

      const paymentResult = await paymentsCollection.insertOne(paymentInfo);

      await bookingCollection.updateOne(
        { _id: new ObjectId(bookingId) },
        {
          $set: {
            status: "paid",
            transactionId: session.payment_intent,
          },
        }
      );

      return res.send({
        success: true,
        message: "Payment Success & Booking Updated!",
        transactionId: session.payment_intent,
        paymentId: paymentResult.insertedId,
      });
    }

    if (paymentExists) {
      return res.send({
        success: true,
        message: "Payment already recorded.",
      });
    }

    res.send({
      success: false,
      message: "Payment not completed or unknown error.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      error: error.message,
    });
  }
});



// Save user's Data

app.post('/users', async(req,res)=>{
  const usersData = req.body;
  usersData.created_At= new Date().toISOString();
  usersData.last_loggedIn= new Date().toISOString();
  usersData.role = 'customer'

  const query ={email:usersData.email}

  const alreadyExists = await usersCollection.findOne(query);

  if(alreadyExists){
    
    const update =await usersCollection.updateOne(query,{$set:{
      last_loggedIn:new Date().toISOString(),
    }},)
   return res.send(update)
  }
  
  
  const result = await usersCollection.insertOne(usersData)
  
  res.send(result)
})


    // get a user's role 
    app.get('/user/role/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email})
      res.send({ role: result?.role })
    })

    // Become a decorator
app.post('/become-decorator', verifyJWT, async (req, res) => {
      const email = req.tokenEmail
      const alreadyExists = await decoratorRequestsCollection.findOne({ email })
      if (alreadyExists)
        return res
          .status(409)
          .send({ message: 'Already requested, wait koro.' })

      const result = await decoratorRequestsCollection.insertOne({ email })
      res.send(result)
    })


    // get all users for admin
    // app.get('/users', verifyJWT, verifyADMIN, async (req, res) => {
    //   const adminEmail = req.tokenEmail
    //   const result = await usersCollection
    //     .find({ email: { $ne: adminEmail } })
    //     .toArray()
    //   res.send(result)
    // })




     // update a user's role
    // app.patch('/update-role', verifyJWT, verifyADMIN, async (req, res) => {
    //   const { email, role } = req.body
    //   const result = await usersCollection.updateOne(
    //     { email },
    //     { $set: { role } }
    //   )
    //   await sellerRequestsCollection.deleteOne({ email })

    //   res.send(result)
    // })




















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
