// The part of the "qrcode" package the Download module uses (it ships no types of its own).
declare module "qrcode" {
  type Options = {
    type?: "svg" | "utf8" | "terminal";
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    color?: { dark?: string; light?: string };
  };
  const QRCode: { toString(text: string, options?: Options): Promise<string> };
  export default QRCode;
}
