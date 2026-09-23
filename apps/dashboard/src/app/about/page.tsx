export default function AboutPage() {
  return (
    <article className="prose">
      <h1>About</h1>
      <p>
        web-kit is a collection of small open-source utilities. Each one is an npm package with a framework-free core
        and a React UI.
      </p>
      <p>There is no backend. Every utility runs on your device, so your files and text stay with you.</p>
      <p>
        The same utilities are also built with Flutter:{" "}
        <a href="https://arthurkrantsevich.github.io/flutter-kit/">flutter-kit</a>.
      </p>
      <p>
        Source code: <a href="https://github.com/ArthurKrantsevich/web-kit">github.com/ArthurKrantsevich/web-kit</a>
      </p>
    </article>
  );
}
