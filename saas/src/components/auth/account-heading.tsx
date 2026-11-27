import styles from "./credentials.module.css";

export function AccountHeading({ id, title }: { id: string; title: string }) {
  return (
    <header className={styles.header} data-scroll-masthead="">
      <img src="/djcu-logo.jpg" alt="DJ Civils Ltd" width={354} height={200} />
      <h1 id={id}>{title}</h1>
      <p>Site Material Daily Records</p>
    </header>
  );
}
