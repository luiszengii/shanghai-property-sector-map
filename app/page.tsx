import { MapExperience } from "@/src/components/MapExperience";
import { LocalEditorShortcut } from "@/src/components/local-research-features";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <MapExperience />
      <LocalEditorShortcut className={styles.editorShortcut} />
    </>
  );
}
