import sharp from "sharp";

const QR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACAAQMAAAD58POIAAAABlBMVEX///8AAABVwtN+AAAACXBI" +
  "WXMAAA7EAAAOxAGVKw4bAAABEUlEQVRIia2Vsa3DMAxEL3ChMiNok3gxITbgxaxNNIJKF4H4j3TwE6T1sbCF5+KM45ECfmsxs46cBkrmcUhAAW69ZMz2ytR4akC22oFUXcq6ECyWzFYxmBoePOmA+7E0q1T5GHQRROcoUPt3Ky+CqMkOtu8raBcBVapZOx6Y+LivIuAvDy4BRCBceEVwwU9DAmiFu5Aq6eGdU4CSj7lPHtzNSIcEMF773RqFCk6TBaD4X2/NfMRsuEESQBVacSOyPcZDAnzDcCQ8bR0SEOUjxjikAQ045xaxtc/OCUBsGO7W3e0+TRaAWLCN02Bvg3SA8do8vUMJqLIC8//dcBG8b8JY3QMaEJ1zFQ7vZ42rwW/9AcnxGospmPkqAAAAAElFTkSuQmCC";

export const QR_EXPECTED_VALUE = "https://example.com/group";

export type ImageFilePayload = Readonly<{
  name: string;
  mimeType: string;
  buffer: Buffer;
}>;

export type ImageFixtures = Readonly<{
  logo: ImageFilePayload;
  qr: ImageFilePayload;
  invalid: ImageFilePayload;
}>;

function createLogoPixels(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const opaque = x < width / 2 || y < height / 2;
      pixels[offset] = 36;
      pixels[offset + 1] = 91;
      pixels[offset + 2] = 232;
      pixels[offset + 3] = opaque ? 220 : 0;
    }
  }
  return pixels;
}

export async function createImageFixtures(): Promise<ImageFixtures> {
  const logoBuffer = await sharp(createLogoPixels(300, 150), {
    raw: { width: 300, height: 150, channels: 4 },
  })
    .png()
    .toBuffer();
  const qrBuffer = await sharp(Buffer.from(QR_PNG_BASE64, "base64"))
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    logo: { name: "transparent-logo.png", mimeType: "image/png", buffer: logoBuffer },
    qr: {
      name: "group-qr.jpg",
      mimeType: "image/jpeg",
      buffer: qrBuffer,
    },
    invalid: {
      name: "broken-image.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a png image"),
    },
  };
}
