import { PencilRuler } from "lucide-react";
import Link from "next/link";
import { MapExperience } from "@/src/components/MapExperience";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <MapExperience />
      <Link href="/sector-editor" className={styles.editorShortcut}>
        <PencilRuler size={17} />
        自己画板块
      </Link>
    </>
  );
}
