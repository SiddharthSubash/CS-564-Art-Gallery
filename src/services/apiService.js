import axios from "axios";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const fetchArtworksByMaker = async (maker) => {
  try {
    const response = await axios.get(`${API_BASE}/artworks-by-maker`, {
      params: { maker },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching artworks by maker:", error);
    return [];
  }
};

const fetchArtists = async (type = "painting", period = "17") => {
  try {
    const response = await axios.get(`${API_BASE}/collections`);
    const artists = new Set();

    response.data.forEach((artObject) => {
      if (artObject.principalOrFirstMaker) {
        artists.add(artObject.principalOrFirstMaker);
      }
    });

    return Array.from(artists).slice(0, 20);
  } catch (error) {
    console.error("Error fetching artists:", error);
    return [];
  }
};

const fetchData = async (type = "painting", period = "17") => {
  try {
    const artists = await fetchArtists(type, period);
    let artistCounts = {};

    for (let artist of artists) {
      try {
        const artworks = await fetchArtworksByMaker(artist);
        artistCounts[artist] = artworks.length;
      } catch (error) {
        console.error("Error fetching data for artist:", artist, error);
        artistCounts[artist] = 0;
      }
    }

    return artistCounts;
  } catch (error) {
    console.error("Error fetching aggregate artist data:", error);
    return {};
  }
};

const fetchGalleryArtist = async (artistName) => {
  try {
    const artworks = await fetchArtworksByMaker(artistName);

    const validArtworks = artworks.filter(
      (obj) => obj.principalOrFirstMaker === artistName,
    );

    if (validArtworks.length > 0) {
      const topArtwork = validArtworks[0];
      return [
        {
          artist: topArtwork.principalOrFirstMaker,
          title: topArtwork.title,
          image: topArtwork.webImage.url,
        },
      ];
    }

    return [];
  } catch (error) {
    console.error(`Error fetching top pieces for artist: ${artistName}`, error);
    return [];
  }
};

const fetchArtworksByTypeAndPeriod = async (type = "painting") => {
  const centuryData = {
    "17th Century": [],
    "18th Century": [],
    "19th Century": [],
  };

  const centuries = ["17", "18", "19"];

  for (let century of centuries) {
    let artistData = {};
    let totalArtworks = 0;
    const artists = await fetchArtists(type, century);

    for (let artist of artists) {
      try {
        const artworks = await fetchArtworksByMaker(artist);
        const artworkCount = artworks.length;

        if (artworkCount > 0) {
          artistData[artist] = artworkCount;
          totalArtworks += artworkCount;
        }
      } catch (error) {
        console.error("Error fetching count for artist:", artist, error);
      }
    }

    const sortedContributions = Object.keys(artistData)
      .map((artist) => ({
        name: artist,
        count: artistData[artist],
        percentage:
          totalArtworks > 0
            ? ((artistData[artist] / totalArtworks) * 100).toFixed(2)
            : "0.00",
      }))
      .sort((a, b) => Number(b.percentage) - Number(a.percentage))
      .slice(0, 3);

    const centuryKey = `${century}th Century`;
    centuryData[centuryKey] = sortedContributions;
  }

  return centuryData;
};

const fetchGallery = async (artists) => {
  let allTopPieces = [];
  for (let artistName of artists) {
    const topPieces = await fetchGalleryArtist(artistName);
    allTopPieces = [...allTopPieces, ...topPieces];
  }
  return allTopPieces;
};

export const getPieceById = async (id) => {
  try {
    const response = await axios.get(`${API_BASE}/piece/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching artwork by ID:", error);
    return null;
  }
};

export const fetchCollections = async () => {
  try {
    const response = await axios.get(`${API_BASE}/collections`);
    return response.data;
  } catch (error) {
    console.error("Error fetching collections:", error);
    return [];
  }
};

export const fetchArtworkCountsByMaterialAndCentury = async (
  material,
  century,
) => {
  try {
    const response = await axios.get(`${API_BASE}/artwork-counts`, {
      params: { material, century },
    });
    return response.data.count;
  } catch (error) {
    console.error("Error fetching artwork counts:", error);
    return 0;
  }
};

const apiService = {
  getPieceById,
  fetchArtworksByMaker,
  fetchArtists,
  fetchData,
  fetchGallery,
  fetchArtworksByTypeAndPeriod,
  fetchCollections,
  fetchArtworkCountsByMaterialAndCentury,
};

export default apiService;
