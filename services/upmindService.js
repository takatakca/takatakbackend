const axios = require("axios");

const UP_API = "https://api.upmind.io/api";
const ADMIN_TOKEN = process.env.UPMIND_KEY;

const client = axios.create({
  baseURL: UP_API,
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// Create new client in Upmind
async function createClient(user) {
  const res = await client.post("/admin/clients", {
    email: user.email,
    firstname: user.firstName,
    lastname: user.lastName,
  });
  return res.data;
}

module.exports = { createClient };





// const axios = require('axios');
// const UPMIND_URL = process.env.UPMIND_URL;
// const UPMIND_KEY = process.env.UPMIND_KEY;

// const makeUpmindRequest = async (method, endpoint, data = {}) => {
//     try {
//       const response = await axios({
//         method: method.toLowerCase(),
//         url: `${UPMIND_URL}/api/v1/${endpoint}`,
//         headers: {
//           'Authorization': `Bearer ${UPMIND_KEY}`,
//           'Content-Type': 'application/json'
//         },
//         data
//       });
//       return response.data;
//     } catch (error) {
//     console.error('Upmind API Error:', {
//         status: error.response?.status,
//         data: error.response?.data,
//         message: error.message
//       });
//       throw error;
//     }
//   };

//   /**
//  * Checks domain availability
//  * @param {String} domain - Domain name to check
//  * @param {Array} tlds - Array of TLDs to check (default: [com, net, org])
//  */
// const checkDomainAvailability = async (domain, tlds = ['com', 'net', 'org']) => {
//     // Make API request to check domain availability
//     return makeUpmindRequest('post', 'domains/check-availability', {
//       domains: [domain], // Array of domains to check
//       tlds: tlds // Array of TLDs to include
//     });
//   };
  
//   /**
//    * Creates a client in Upmind
//    * @param {Object} userData - User data from your database
//    */
//   const createUpmindClient = async (userData) => {
//     // Make API request to create client
//     return makeUpmindRequest('post', 'clients', {
//       email: userData.email,
//       first_name: userData.firstName,
//       last_name: userData.lastName,
//       phone: userData.phone,
//       password: generateRandomPassword() // Auto-generated secure password
//     });
//   };
  
//   // Helper function to generate random passwords
//   function generateRandomPassword() {
//     const randomString = Math.random().toString(36).slice(-8); // Random alphanumeric
//     return `${randomString}A1!`; // Ensure complexity
//   }
  

//   module.exports = {
//     checkDomainAvailability,
//     createUpmindClient,
//     makeUpmindRequest
//   };
  