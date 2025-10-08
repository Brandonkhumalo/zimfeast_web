import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CartItem } from "./types";

interface CartComponentProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  setItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  currency: string;
  userLocation: { lat: number; lng: number } | null;
}

export default function CartComponent({
  isOpen,
  onClose,
  items,
  setItems,
  currency,
  userLocation,
}: CartComponentProps) {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    if (items.length === 0) return;

    try {
      setLoading(true);

      // Get token from localStorage
      const token = localStorage.getItem("token");
      if (!token) {
        alert("You must be logged in to place an order");
        return;
      }

      // Build payload expected by backend
      const payload = {
        restaurant: 'e1014e44-0e90-4d26-a1b3-2aa1d98fb413', 
        total_fee: items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        ),
        tip: 5.0, // demo, you can let users choose
        status: "created",
        items: items.map((item) => ({
          menu_item_id: parseInt(item.id, 10),
          quantity: item.quantity,
          price: item.price,
        })),
      };

      const res = await fetch("http://127.0.0.1:8000/api/orders/create/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // JWT auth
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }

      const data = await res.json();

      // Redirect with backend's orderId
      setLocation(`/checkout?orderId=${data.id}`);
      onClose();
    } catch (err: any) {
      console.error("Checkout failed:", err.message);
      alert("Failed to place order: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (id: string, quantity: number) => {
    if (quantity === 0) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, quantity } : item))
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="bg-white w-96 h-full p-6 overflow-y-auto relative shadow-xl">
        <h2 className="text-xl font-bold mb-4">Your Cart</h2>

        {items.length === 0 ? (
          <p className="text-muted-foreground">Your cart is empty</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {currency} {(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      handleQuantityChange(item.id, item.quantity - 1)
                    }
                  >
                    -
                  </Button>
                  <span>{item.quantity}</span>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleQuantityChange(item.id, item.quantity + 1)
                    }
                  >
                    +
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          onClick={handleCheckout}
          className="mt-6 w-full"
          disabled={items.length === 0 || loading}
        >
          {loading ? "Placing order..." : "Proceed to Checkout"}
        </Button>

        <Button
          onClick={onClose}
          variant="ghost"
          className="absolute top-4 right-4 text-lg"
        >
          ✕
        </Button>
      </div>
    </div>
  );
}
