import exifr from "exifr";

const SUSPICIOUS_SOFTWARE =
  /photoshop|gimp|midjourney|dall[\s-]?e|stable.?diffusion|firefly|canva|ai\s|generative|leonardo|ideogram/i;

export async function runMetadataCheck(buffer: Buffer): Promise<{
  score: number;
  maxScore: number;
  findings: string[];
  hasExif: boolean;
}> {
  const findings: string[] = [];
  let score = 0;
  const maxScore = 20;
  let hasExif = false;

  try {
    const exif = await exifr.parse(buffer, {
      pick: ["Software", "ModifyDate", "DateTimeOriginal", "Make", "Model", "HostComputer"],
    });

    if (!exif || Object.keys(exif).length === 0) {
      score += 10;
      findings.push("No EXIF metadata (screenshot, export, or generated image)");
    } else {
      hasExif = true;
      const software = String(exif.Software ?? exif.HostComputer ?? "").trim();
      if (software && SUSPICIOUS_SOFTWARE.test(software)) {
        score += 15;
        findings.push(`Suspicious software in metadata: ${software}`);
      }
      if (!exif.DateTimeOriginal && !exif.ModifyDate) {
        score += 5;
        findings.push("Missing capture/modify timestamps in EXIF");
      }
      if (!exif.Make && !exif.Model) {
        score += 4;
        findings.push("No camera/device info in EXIF");
      }
    }
  } catch {
    score += 6;
    findings.push("Could not parse image metadata");
  }

  return { score: Math.min(maxScore, score), maxScore, findings, hasExif };
}
