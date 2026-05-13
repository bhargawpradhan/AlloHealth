export {};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

type RazorpayInstance = {
  open: () => void;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  order_id: string;
  handler: (response: RazorpayPaymentSuccess) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
};

type RazorpayPaymentSuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
