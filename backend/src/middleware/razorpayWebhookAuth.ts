import { verifyWebhookSignature } from "../services/razorpayService";

export function validateRazorpayWebhookRequest(
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader) {
    return false;
  }
  return verifyWebhookSignature(rawBody, signatureHeader);
}
