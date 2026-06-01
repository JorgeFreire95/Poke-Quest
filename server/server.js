require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Check that the access token is loaded
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!ACCESS_TOKEN || ACCESS_TOKEN.startsWith('APP_USR-1822508758140679-053122-')) {
  console.log("Servidor cargado con token de Mercado Pago.");
} else {
  console.warn("ADVERTENCIA: No se detectó un Access Token de Mercado Pago válido en el archivo .env");
}

// POST endpoint to process payment
app.post('/api/pay', async (req, res) => {
  const { token, email, rut, cardPrefix, name } = req.body;

  if (!token || !email || !rut) {
    return res.status(400).json({ error: "Faltan parámetros requeridos: token, email y rut." });
  }

  // Handle mock tokens locally for developer testing
  if (token.startsWith('MOCK-')) {
    console.log(`[Modo Simulación] Procesando token mock localmente: ${token}`);
    return res.status(200).json({
      status: "approved",
      status_detail: "accredited",
      id: "MOCK-PAY-" + Date.now()
    });
  }

  try {
    // 1. Detect payment_method_id dynamically using the card prefix (first 6 digits of the card)
    let paymentMethodId = 'visa'; // Default fallback
    if (cardPrefix) {
      try {
        const pmResponse = await fetch(`https://api.mercadopago.com/v1/payment_methods/search?public_key=APP_USR-78fe6e2f-78d1-4f40-b9d9-7904ade1860d&bins=${cardPrefix}`, {
          method: 'GET'
        });
        const pmData = await pmResponse.json();
        if (pmData.results && pmData.results.length > 0) {
          paymentMethodId = pmData.results[0].id;
          console.log(`Método de pago detectado: ${paymentMethodId} para el BIN: ${cardPrefix}`);
        }
      } catch (pmErr) {
        console.error("Error al detectar método de pago, usando Visa por defecto:", pmErr);
      }
    }

    // 2. Build the payment payload
    // Clean RUT: remove dots and dashes (Mercado Pago only wants numbers and verification digit)
    const cleanRut = rut.replace(/[^0-9kK]/g, '');

    const paymentPayload = {
      transaction_amount: 2000, // $2.000 CLP
      token: token,
      description: "Poke-Quest Premium",
      installments: 1,
      payment_method_id: paymentMethodId,
      payer: {
        email: email,
        identification: {
          type: "RUT",
          number: cleanRut
        }
      }
    };

    const idempotencyKey = "idemp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

    console.log(`Procesando pago en Mercado Pago por $2000 CLP...`);
    
    // 3. Request Payment Creation
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(paymentPayload)
    });

    const paymentResult = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Error devuelto por la API de Mercado Pago:", paymentResult);
      return res.status(mpResponse.status).json({
        error: paymentResult.message || "Error al procesar el pago con Mercado Pago.",
        details: paymentResult.cause || []
      });
    }

    console.log(`Pago procesado. ID: ${paymentResult.id}, Estado: ${paymentResult.status}`);
    
    // Return success to frontend
    return res.status(200).json({
      status: paymentResult.status,
      status_detail: paymentResult.status_detail,
      id: paymentResult.id
    });

  } catch (err) {
    console.error("Error interno del servidor backend:", err);
    return res.status(500).json({ error: "Error interno al procesar el pago en el servidor." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de pagos corriendo en http://localhost:${PORT}`);
});
