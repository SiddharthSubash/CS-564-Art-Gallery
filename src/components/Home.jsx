import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiService from "../services/apiService";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/home.css"; // Import CSS file

const Home = () => {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch artworks from collections when component mounts
    const fetchArtworks = async () => {
      try {
        // Fetch artworks from collections
        const artworks = await apiService.fetchCollections();
        setArtworks(artworks);
      } catch (error) {
        console.error("Error fetching artworks:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchArtworks();
  }, []);

  return (
    <div className="container">
      <h1 className="my-4">Galleria d’arte</h1>
      {loading ? (
        <div className="loading-container">
          <iframe
            src="https://giphy.com/embed/Wodg2kOPJRLbw3Pfjh"
            frameBorder="0"
            className="giphy-embed"
            allowFullScreen
            title="loading"
          ></iframe>
          <p>
            <a href="https://giphy.com/gifs/loop-circle-loading-Wodg2kOPJRLbw3Pfjh"></a>
          </p>
        </div>
      ) : (
        <Carousel
          showArrows={true}
          infiniteLoop={true}
          showThumbs={false}
          showStatus={false}
          autoPlay={true}
          interval={3000}
          centerMode={true}
          centerSlidePercentage={40}
          className="carousel"
        >
          {artworks.map((artwork, index) => (
            // Render carousel item for each artwork
            <Link
              to={`/info-piece/${artwork.objectNumber}`}
              key={index}
              className="carousel-item-container"
            >
              <img
                src={artwork.webImage.url}
                alt={artwork.title || `Artwork ${index + 1}`}
                className="carousel-image"
              />
              <p className="legend">{artwork.title}</p>
            </Link>
          ))}
        </Carousel>
      )}
    </div>
  );
};

export default Home;
