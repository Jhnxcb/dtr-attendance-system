const form = document.getElementById("qrForm");
const staffId = document.getElementById("staffId");
const staffName = document.getElementById("staffName");
const qrPreview = document.getElementById("qrPreview");

function makeQrUrl(value, size = 320) {
  const data = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${data}`;
}

function createQr(event) {
  event.preventDefault();

  const id = staffId.value.trim();
  const name = staffName.value.trim();

  if (!id) {
    return;
  }

  const qrValue = name ? JSON.stringify({ staffId: id, name }) : id;
  const qrUrl = makeQrUrl(qrValue);

  qrPreview.innerHTML = `
    <article class="qr-card">
      <img src="${qrUrl}" alt="QR code for ${id}" />
      <strong>${id}</strong>
      <p>${name || "Staff QR Code"}</p>
      <small>${qrValue}</small>
      <div class="controls">
        <button type="button" id="printButton">Print</button>
        <a class="button-link" href="${qrUrl}" download="${id}-qr.png">Download QR</a>
      </div>
    </article>
  `;

  document.getElementById("printButton").addEventListener("click", () => window.print());
}

form.addEventListener("submit", createQr);
