const resetPasswordEmail = (resetLink, userName) => {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - Potongin</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #333333;
      font-size: 28px;
      margin: 0;
    }
    .content {
      color: #555555;
      line-height: 1.6;
      font-size: 16px;
    }
    .content p {
      margin: 15px 0;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .reset-button {
      display: inline-block;
      padding: 15px 40px;
      background-color: #007bff;
      color: #ffffff;
      text-decoration: none;
      border-radius: 5px;
      font-size: 16px;
      font-weight: bold;
    }
    .reset-button:hover {
      background-color: #0056b3;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eeeeee;
      text-align: center;
      color: #999999;
      font-size: 14px;
    }
    .warning {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      color: #856404;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        padding: 20px;
      }
      .header h1 {
        font-size: 24px;
      }
      .reset-button {
        padding: 12px 30px;
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🔐 Reset Password Anda</h1>
    </div>
    <div class="content">
      <p>Halo${userName ? ' ' + userName : ''},</p>
      <p>Kami menerima permintaan untuk mereset password akun Potongin Anda. Klik tombol di bawah ini untuk membuat password baru:</p>
      
      <div class="button-container">
        <a href="${resetLink}" class="reset-button">Reset Password</a>
      </div>
      
      <p>Atau salin dan tempel link berikut ke browser Anda:</p>
      <p style="word-break: break-all; color: #007bff;">${resetLink}</p>
      
      <div class="warning">
        <strong>⚠️ Penting:</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Link ini hanya berlaku selama <strong>1 jam</strong></li>
          <li>Jika Anda tidak meminta reset password, abaikan email ini</li>
          <li>Jangan bagikan link ini kepada siapa pun</li>
        </ul>
      </div>
      
      <p>Jika Anda mengalami masalah dengan tombol di atas, salin dan tempel URL ke browser Anda.</p>
    </div>
    <div class="footer">
      <p>Email ini dikirim otomatis, mohon tidak membalas email ini.</p>
      <p>&copy; ${new Date().getFullYear()} Potongin. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
};

module.exports = resetPasswordEmail;
