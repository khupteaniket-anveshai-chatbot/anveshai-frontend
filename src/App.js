import React from "react";
import StudyMaterialApp from "./StudyMaterialApp";

function App() {
  return (
    <StudyMaterialApp
      apiBase="http://127.0.0.1:8000/api/v1"
      token="test" // use test token in dev or remove if you enable real auth
    />
  );
}

export default App;
