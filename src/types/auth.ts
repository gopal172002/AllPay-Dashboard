export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  companyName: string;
  companySize: string;
  monthlySpend: string;
  companyType: string;
  jobTitle?: string;
  createdAt: string;
  /** Present when this login maps to an AdminUser record. */
  adminId?: string;
  adminRole?: string;
}

export interface SignUpPayload {
  email: string;
  fullName: string;
  companyName: string;
  companySize: string;
  monthlySpend: string;
  companyType: string;
  password: string;
  jobTitle?: string;
}

export const COMPANY_TYPES = [
  "Private Limited Company (Pvt Ltd)",
  "Public Limited Company (Ltd)",
  "Limited Liability Partnerships (LLCs or LLPs)",
  "Section 8 Company (Non-profit organizations, NGOs, charitable trusts)",
  "One Person Company (OPC)",
  "Partnership Firm",
  "Sole Proprietorship",
] as const;

export const COMPANY_SIZE_OPTIONS = [
  "1–10 employees",
  "11–50 employees",
  "51–200 employees",
  "201–500 employees",
  "500+ employees",
] as const;

export const MONTHLY_SPEND_OPTIONS = [
  "Under ₹1 lakh",
  "₹1 lakh – ₹5 lakh",
  "₹5 lakh – ₹25 lakh",
  "₹25 lakh – ₹1 crore",
  "Above ₹1 crore",
] as const;
