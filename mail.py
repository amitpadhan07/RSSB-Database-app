import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

sender_email = "rssbsecrudrapur@gmail.com"
sender_password = "uxpa mgyf ojym owtu"

recipients = [
    "padhanamit072006@gmail.com",
    "aamit75789@gmail.com",
    "ayushisaini554@gmail.com"
]

subject = "Default Notification"
message_body = """
Hello Chuiya,

This is a mail for the chuiya(ayu) ,khana kha le ,jiska koi nhi hota uska upr wala hota hai .

Thank you!
Apka Pyara Bhai
Amit Padhan
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
