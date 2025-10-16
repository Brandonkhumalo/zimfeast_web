import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CartItem } from "./types";

// Add these for Google Places Autocomplete
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import useOnclickOutside from "react-cool-onclickoutside";

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

  const [method, setMethod] = useState<"delivery" | "collection">("collection");
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Initialize Google Places Autocomplete
  const {
    ready,
    value,
    setValue,
    suggestions: { status, data },
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      /* optional: bounds, location bias */
    },
    debounce: 300,
  });

  const ref = useOnclickOutside(() => {
    clearSuggestions();
  });

  if (!isOpen) return null;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (method === "delivery" && !deliveryCoords) {
      alert("Please select a delivery address");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        alert("You must be logged in to place an order");
        return;
      }

      const payload = {
        restaurant: 'e1014e44-0e90-4d26-a1b3-2aa1d98fb413', // demo
        method,
        restaurant_lat: -17.8292,
        restaurant_lng: 31.0522,
        total_fee: items.reduce((acc, item) => acc + item.price * item.quantity, 0),
        tip: 5.0,
        items: items.map((item) => ({
          menu_item_id: "88bd1ee3-21a1-4949-baec-b5c5f606bfa4",
          quantity: item.quantity,
          price: item.price,
        })),
        delivery_lat: method === "delivery" ? deliveryCoords?.lat : null,
        delivery_lng: method === "delivery" ? deliveryCoords?.lng : null,
      };

      const res = await fetch("http://127.0.0.1:8000/api/orders/create/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }

      const data = await res.json();
      setLocation(`/checkout?orderId=${data.order.id}`);
      onClose();
    } catch (err: any) {
      console.error("Checkout failed:", err.message);
      alert("Failed to place order: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAddress = async (description: string) => {
    setValue(description, false);
    clearSuggestions();
    try {
      const results = await getGeocode({ address: description });
      const { lat, lng } = await getLatLng(results[0]);
      setDeliveryCoords({ lat, lng });
    } catch (error) {
      console.error("Error fetching geocode: ", error);
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

        {/* Delivery / Collection Section */}
        <div className="mt-6">
          <p className="font-medium mb-2">Choose Method:</p>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="delivery"
                checked={method === "delivery"}
                onChange={() => setMethod("delivery")}
              />
              Delivery
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="collection"
                checked={method === "collection"}
                onChange={() => setMethod("collection")}
              />
              Collection
            </label>
          </div>

          {method === "delivery" && (
            <div ref={ref} className="mt-2">
              <input
                type="text"
                placeholder="Enter delivery address"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!ready}
                className="w-full border p-2 rounded mb-2"
              />
              {status === "OK" && (
                <ul className="border rounded max-h-40 overflow-y-auto">
                  {data.map(({ place_id, description }) => (
                    <li
                      key={place_id}
                      className="p-2 hover:bg-gray-200 cursor-pointer"
                      onClick={() => handleSelectAddress(description)}
                    >
                      {description}
                    </li>
                  ))}
                </ul>
              )}

              {deliveryCoords && (
                <div className="border h-40 w-full mt-2">
                  <iframe
                    width="100%"
                    height="100%"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${deliveryCoords.lat},${deliveryCoords.lng}&hl=es;z=14&output=embed`}
                  ></iframe>
                </div>
              )}
            </div>
          )}
        </div>

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
