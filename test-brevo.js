require("dotenv").config();
const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendEmail(to, subject, text) {
  return apiInstance.sendTransacEmail({
    sender: {
      email: "rssbsecrudrapur@gmail.com", // 🔥 HARD CODE VERIFIED SENDER
      name: "RSSB Rudrapur"
    },
    to: [
      {
        email: to
      }
    ],
    subject: subject,
    textContent: text
  });
}

(async () => {
  try {
    await sendEmail(
      "padhanamit072006@gmail.com",
      "Brevo HTTP API Test",
      "This email is sent using Brevo HTTP API successfully."
    );
    console.log("✅ Email sent successfully via Brevo HTTP API");
  } catch (err) {
    console.error("❌ Email failed");
    console.error(err.response?.body || err);
  }
})();
