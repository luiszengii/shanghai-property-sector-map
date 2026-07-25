import {
  Factory,
  Flower2,
  GraduationCap,
  ShieldAlert,
  ShoppingBag,
  Stethoscope,
  TrainFront,
  Trees,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CategoryIconName } from "@/src/types/map";

const categoryIconByName: Record<CategoryIconName, LucideIcon> = {
  GraduationCap,
  Stethoscope,
  ShoppingBag,
  Trees,
  TrainFront,
  Factory,
  Flower2,
  Zap,
  ShieldAlert,
};

export function CategoryIcon({
  name,
  size = 14,
  strokeWidth = 2.25,
}: {
  name: CategoryIconName;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = categoryIconByName[name];
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}
