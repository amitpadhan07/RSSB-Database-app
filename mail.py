import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

sender_email = "rssbsecrudrapur@gmail.com"
sender_password = "hxag laxd rgxb nnni"

recipients = [
    "padhanamit072006@gmail.com",
    "lavanyajoshi889@gmail.com"
]

subject = "RSSB Account Password Reset Successful"
message_body = """
Dear LAVANYA JOSHI,

Your password for the RSSB system has been successfully reset.

Please use the following temporary credentials to log in:
Username: lavi07
New Password: Lavi@07

For security purposes, please ensure you change your password immediately upon logging in to the system.

This action was performed by your request (Self-Initiated Reset).
Timestamp: 11/12/2025 12:47:00 PM .

---

Thank you for using the RSSB system.
You can log in to your account here: https://rssb-rudrapur-database-api.onrender.com

For any other support or queries regarding your account or the system, please contact us at: rssbsecrudrapur@gmail.com

Best regards,
The RSSB Administration Team
"""

try:
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(sender_email, sender_password)

    for email in recipients:
        msg = MIMEMultipart()
        msg["From"] = sender_email
        msg["To"] = email
        msg["Subject"] = subject

        msg.attach(MIMEText(message_body, "plain"))

        server.sendmail(sender_email, email, msg.as_string())
        print(f"Email sent to {email}")

    server.quit()

except Exception as e:
    print("Error:", e)
