import {
  Baby, Bike, BookOpen, Briefcase, Camera, Compass, Dumbbell, GraduationCap, Heart, HeartPulse, Home, Landmark, Leaf, Lightbulb, Mountain, Palette, Plane, Sprout, Star, Stethoscope, Sun, Users, type LucideIcon,
} from 'lucide-react'

export const DOMAIN_ICONS: Record<string, LucideIcon> = {
  Briefcase, Users, BookOpen, Sprout, Landmark, HeartPulse, Stethoscope, GraduationCap, Heart, Home, Baby, Plane, Dumbbell, Bike, Camera, Palette, Lightbulb, Mountain, Leaf, Sun, Star, Compass,
}

export const DomainIcon = ({ name, className }: { name: string; className?: string }) => {
  const Icon = DOMAIN_ICONS[name] ?? Compass
  return <Icon className={className} />
}
