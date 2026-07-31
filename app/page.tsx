import { MapExperience } from "@/src/components/MapExperience";
import {
  LocalEditorShortcut,
  LocalEnvironmentSwitcher,
} from "@/src/components/local-research-features";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <MapExperience />
      <LocalEnvironmentSwitcher />
      <LocalEditorShortcut className={styles.editorShortcut} />
    </>
  );
}
