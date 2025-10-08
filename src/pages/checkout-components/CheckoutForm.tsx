import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Order } from "./types";
import { MobilePaymentFields } from "./MobilePaymentFields";

interface CheckoutFormProps {
  orderId: string;
}

export const CheckoutForm = ({ orderId }: CheckoutFormProps) => {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [paymentMethod, setPaymentMethod] = useState<"web" | "mobile" | "voucher">("web");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mobileProvider, setMobileProvider] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  // --- Fetch the order ---
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });
  const currentOrder = orders?.find((o) => o.id === orderId);

  // --- Payment Mutation ---
  const paymentMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      let body: any = { order_id: orderId };

      if (paymentMethod === "mobile") {
        let cleanPhone = phoneNumber.replace(/\s+/g, "").replace(/[-()]/g, "");
        let normalizedPhone = cleanPhone;
        if (cleanPhone.startsWith("0")) normalizedPhone = "+263" + cleanPhone.substring(1);
        else if (cleanPhone.startsWith("263")) normalizedPhone = "+" + cleanPhone;
        body.method = "paynow";
        body.phone = normalizedPhone;
        body.provider = mobileProvider;
      } else if (paymentMethod === "voucher") {
        body.method = "voucher";
      } else {
        body.method = "paynow";
      }

      const res = await fetch("http://127.0.0.1:8000/api/payments/create-payment/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      // ✅ Successful voucher payment
      if (paymentMethod === "voucher" && data.status === "paid_with_voucher") {
        toast({
          title: "Paid with Voucher",
          description: "Your voucher covered the full order.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        setTimeout(() => setLocation("/home"), 1000);
        return;
      }

      // ✅ Redirect to PayNow web checkout
      if (data.paynow_url) {
        toast({
          title: "Redirecting to PayNow...",
          description: "Please complete your payment.",
        });
        window.location.href = data.paynow_url;
        return;
      }

      // ✅ Mobile payment confirmation (poll or direct)
      if (data.status === "paid" || data.status === "Payment Successful") {
        toast({ title: "Payment Successful", description: "Redirecting..." });
        setTimeout(() => setLocation("/home"), 1500);
        return;
      }

      // ❌ Unexpected
      toast({
        title: "Payment Failed",
        description: "Unexpected response from payment API.",
        variant: "destructive",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Payment Failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // --- Voucher Deposit Mutation ---
  const voucherDepositMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("http://127.0.0.1:8000/api/payments/deposit-voucher/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: depositAmount }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Deposit Started",
        description: "Redirecting to PayNow to top up voucher balance...",
      });
      window.location.href = data.paynow_url;
    },
  });

  // --- Poll for payment status (for mobile) ---
  useEffect(() => {
    let interval: any;
    if (paymentMethod === "mobile" && paymentMutation.isSuccess) {
      interval = setInterval(async () => {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `http://127.0.0.1:8000/api/payments/check-status/${orderId}/`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === "paid" || data.status === "Payment Successful") {
            toast({ title: "Payment Confirmed", description: "Redirecting to home..." });
            clearInterval(interval);
            setTimeout(() => setLocation("/home"), 1500);
          }
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [paymentMutation.isSuccess, paymentMethod, orderId, toast, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrder) {
      toast({ title: "Order Not Found", variant: "destructive" });
      return;
    }

    if (paymentMethod === "mobile" && (!phoneNumber || !mobileProvider)) {
      toast({ title: "Missing Info", description: "Please fill phone and provider." });
      return;
    }

    paymentMutation.mutate();
  };

  if (isLoading) return <div>Loading order...</div>;
  if (!currentOrder) return <div>Order not found</div>;

  const isProcessing = paymentMutation.isPending || voucherDepositMutation.isPending;

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Complete Your Payment</CardTitle>
        <Badge variant="outline">Order #{currentOrder.id.slice(-8)}</Badge>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            value={paymentMethod}
            onValueChange={(value) =>
              setPaymentMethod(value as "web" | "mobile" | "voucher")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="web">PayNow Web</SelectItem>
              <SelectItem value="mobile">PayNow Mobile</SelectItem>
              <SelectItem value="voucher">Feast Voucher</SelectItem>
            </SelectContent>
          </Select>

          {paymentMethod === "mobile" && (
            <MobilePaymentFields
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              mobileProvider={mobileProvider}
              setMobileProvider={setMobileProvider}
            />
          )}

          {paymentMethod === "voucher" && (
            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground mb-2">
                Use your voucher balance to pay. If you need to deposit funds,
                enter an amount below:
              </p>
              <Input
                type="number"
                min="1"
                placeholder="Enter amount to deposit"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <Button
                type="button"
                className="w-full mt-2"
                onClick={() => voucherDepositMutation.mutate()}
                disabled={!depositAmount || voucherDepositMutation.isPending}
              >
                {voucherDepositMutation.isPending
                  ? "Redirecting..."
                  : "Deposit to Voucher"}
              </Button>
            </div>
          )}

          <Button type="submit" disabled={isProcessing} className="w-full">
            {isProcessing
              ? "Processing..."
              : `Pay ${currentOrder.currency} ${parseFloat(
                  currentOrder.total.toString()
                ).toFixed(2)}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
