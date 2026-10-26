import {
  BookOpen,
  Clapperboard,
  Coffee,
  Disc3,
  Flower2,
  Frame,
  Landmark,
  Laptop,
  LayoutGrid,
  Leaf,
  Library,
  MapPin,
  Palette,
  Trees,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCategory } from "@/types";

export { CATEGORY_LABEL } from "@/lib/recommendations/activities";

/** Marker colour, gradient for fallback art, and marker shape (round = open-air). Icon carries meaning beyond colour. */
export const CATEGORY_META: Record<PlaceCategory, { icon: LucideIcon; color: string; art: [string, string, string]; shape: "pin" | "round" }> = {
  cafe: { icon: Coffee, color: "#F6C29B", art: ["#FCE5D9", "#F6C29B", "#D98FA8"], shape: "pin" },
  tea: { icon: Leaf, color: "#C9D6BE", art: ["#F3F1E3", "#C9D6BE", "#9FB894"], shape: "pin" },
  library: { icon: Library, color: "#C7B6EE", art: ["#EEE8FA", "#C7B6EE", "#8F7FC4"], shape: "pin" },
  bookstore: { icon: BookOpen, color: "#E9AFC2", art: ["#FCE5EC", "#E9AFC2", "#B8668A"], shape: "pin" },
  park: { icon: Trees, color: "#AFC6A3", art: ["#EEF3E6", "#B9C8B0", "#7F9775"], shape: "round" },
  garden: { icon: Flower2, color: "#C4D4A8", art: ["#F6F3DF", "#C4D4A8", "#D98FA8"], shape: "round" },
  gallery: { icon: Frame, color: "#F2C4D0", art: ["#FFF1F3", "#F2B9C8", "#B9A5E8"], shape: "pin" },
  museum: { icon: Landmark, color: "#DCCDF0", art: ["#F6F1FC", "#D9D0F2", "#A08BC9"], shape: "pin" },
  arts_centre: { icon: Palette, color: "#F4D3A8", art: ["#FFF4E2", "#F6C29B", "#E58FA0"], shape: "pin" },
  coworking: { icon: Laptop, color: "#F2E3A0", art: ["#FFFBEA", "#F7E6A2", "#E3B776"], shape: "pin" },
  cinema: { icon: Clapperboard, color: "#C7AFCD", art: ["#F1E7F2", "#C7AFCD", "#59465F"], shape: "pin" },
  music: { icon: Disc3, color: "#EDB497", art: ["#FDEDE4", "#EDB497", "#B97A8F"], shape: "pin" },
  community: { icon: Users, color: "#E9CDA9", art: ["#FBF2E6", "#E9CDA9", "#C59A79"], shape: "pin" },
  plaza: { icon: LayoutGrid, color: "#E9D9C6", art: ["#FBF6EF", "#E9D9C6", "#C8AE95"], shape: "round" },
  other: { icon: MapPin, color: "#E2D6DE", art: ["#F8F3F5", "#E2D6DE", "#A99AA6"], shape: "pin" },
};
