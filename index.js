require('dotenv').config(); // Load environment variables
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // To read x-www-form-urlencoded
const port = process.env.PORT || 3000;


const pool = new Pool({
  // Use the connection string provided by Railway
  connectionString: process.env.DATABASE_URL,
  // Required for cloud databases to prevent "self-signed certificate" errors
  ssl: {
    rejectUnauthorized: false 
  }
});


app.get('/authenticate/:token', async (req, res) => {

    // Extract the token
    const { token } = req.params;

    // Decode 
    const decoded = jwt.decode(token);
    if (!decoded) {
       
        console.log('Invaid Token Format Decode');
        return res.status(401).send("Invalid token format.");
    }

    const decodedUsername = decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];

    console.log('Decoded User');

    
    // Extract Headers
    const platform = req.header('Eleos-Mobile-App-Platform');
    const ipAddress = req.header('x-forwarded-for');

    console.log('Got Headers');


    try {

         console.log('Try thus!');
        
        // Database Lookup
        const userQuery = 'SELECT * FROM users WHERE username ILIKE $1';
        const result = await pool.query(userQuery, [decodedUsername]);
        const user = result.rows[0];

        console.log('Looked up');


        // Decode


        // Validation
        if (!user) {
            console.log(`(GET) Verify failed: User ${decodedUsername} not found in DB.`);
            return res.status(401).send("Unauthorized due to invalid token.");
        }

        console.log('Vaildated');


        // Response
        const response = {
            full_name: user.full_name,
            api_token: token,
            web_token: user.web_token || null,
            dashboard_code: "default_dashboard",
            menu_code: "main_menu",
            custom: {
                "verified_on": platform,
                "client_ip": ipAddress
            }
        };

        res.status(200).json(response);

    } catch (err) {
        console.error("Verification Error:", err.message);
        res.status(500).send("Internal Server Error");
    }
});



app.post('/authenticate', async (req, res) => {

    // Extract Headers
    const platform = req.header('Eleos-Mobile-App-Platform');
    const appVersion = req.header('Eleos-Mobile-App-Version');
    const ipAddress = req.header('x-forwarded-for');

    // Extract Body
    const { username, password, is_team_driver_login } = req.body;

    try {

        // Database Lookup
        const userQuery = 'SELECT * FROM users WHERE username = $1';
        const result = await pool.query(userQuery, [username]);
        const user = result.rows[0];

        // Verify User and Password
        if (!user || user.password !== password) {
            
            console.log(`(Post) Verify failed for token: ${token}`);
            return res.status(401).send("Unauthorized due to invalid username or password.");
        }

        // Response
        const response = {
            full_name: user.full_name,
            api_token: user.current_token,
            username: user.username,
            web_token: user.web_token || null
        };

        // If team driver login is true, the 'telematics' object must be included
        if (is_team_driver_login === 'true' || is_team_driver_login === true) 
        {
          // Im not sure if I need to do anything here for the purpose of the web service project
        }

        res.status(200).json(response);

    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/loads', async (req, res) => {

    // Extract Token
    const authHeader = req.header('Authorization') || '';
    const tokenMatch = authHeader.match(/token=(.+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    // Vaildation
    if (!token) {
        return res.status(401).send("Unauthorized: Missing Token");
    }

    try {

        // Identify User
        const userResult = await pool.query('SELECT id FROM users WHERE current_token = $1', [token]);
        const user = userResult.rows[0];
        
        // Vaildation
        if (!user) {
            return res.status(401).send("Unauthorized: Invalid Token");
        }

        // Get Loads
        const loadsResult = await pool.query('SELECT * FROM loads WHERE user_id = $1 ORDER BY sort ASC', [user.id]);

        // Map database rows to JSON
        const response = loadsResult.rows.map(load => ({
            id: load.id,
            display_identifier: load.display_identifier,
            sort: load.sort,
            order_number: load.order_number,
            load_status: load.load_status,
            load_status_label: load.load_status_label,
            active: load.active,
            current: load.current,
            customer_name: load.customer_name,
            special_notes: load.special_notes,
            actions: [],
            fields: [],
            shipper: {},
            stops: [],
            consignee: {},
            custom: {}
        }));

        res.status(200).json(response);

    } catch (err) {
        console.error("Loads Error:", err.message);
        res.status(500).send("Internal Server Error");
    }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});