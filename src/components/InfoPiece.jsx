import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiService from "../services/apiService";
import "../styles/infopiece.css";
// Import CSS file

const InfoPiece = () => {
  // Get the objectNumber from URL params
  const { id } = useParams();
  // Debugging statement
  console.log("id:", id);
  const [artwork, setArtwork] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch artwork details when component mounts or id changes
  useEffect(() => {
    const fetchArtwork = async () => {
      try {
        // Fetch artwork details by objectNumber
        const artworkData = await apiService.getPieceById(id);
        setArtwork(artworkData);
      } catch (error) {
        console.error("Error fetching artwork details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchArtwork();
  }, [id]);

  // Display loading message while data is being fetched
  if (loading) {
    return <div>Loading...</div>;
  }

  // Display message if artwork data is not found
  if (!artwork) {
    return <div>Artwork not found.</div>;
  }

  // Display artwork details
  return (
    <div className="container">
      <h1 id="piecetitle">{artwork.title}</h1>
      <img id="pieceimg" src={artwork.webImage.url} alt={artwork.title} />
      <p id="art">Artist: {artwork.principalOrFirstMaker}</p>
      <p id="art">Year: {artwork.dating.presentingDate}</p>
      <p id="art">Description: {artwork.description}</p>
      <p style={{ fontStyle: "italic", color: "gray" }}>
        (Translation to English is not available)
      </p>
    </div>
  );
};

export default InfoPiece;
