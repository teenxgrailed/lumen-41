import {
  FORECAST_TTL_MS,
  cleanCity,
  describeWeather,
  memoryCache,
  searchCities,
  weatherFor,
} from "../open-meteo";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const json = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    status: ok ? 200 : 503,
    json: () => Promise.resolve(body),
  } as Response);

const GEO = {
  results: [
    { name: "Kyiv", country: "Ukraine", latitude: 50.45, longitude: 30.52 },
  ],
};
const FORECAST = {
  current: { temperature_2m: 13.6, weather_code: 2 },
  daily: { temperature_2m_max: [17.2], temperature_2m_min: [8.8] },
};

function fetcher() {
  return jest.fn((url: string) =>
    url.includes("geocoding") ? json(GEO) : json(FORECAST)
  );
}

describe("weatherFor", () => {
  it("geocodes the city, reads today's forecast and tidies the numbers", async () => {
    const f = fetcher();
    const w = await weatherFor("  Kyiv ", { fetcher: f, cache: memoryCache() });
    expect(w).toEqual({
      city: "Kyiv",
      temp: 14,
      min: 9,
      max: 17,
      code: 2,
      summary: "Partly cloudy",
      feelsLike: 14,
      precipChance: null,
      windKph: null,
      sunrise: null,
      sunset: null,
      hours: [],
    });
    const urls = f.mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain("geocoding-api.open-meteo.com");
    expect(urls[0]).toContain("name=Kyiv");
    expect(urls[1]).toContain("latitude=50.45");
  });

  it("sends only the city: no key, no device location", async () => {
    const f = fetcher();
    await weatherFor("Kyiv", { fetcher: f, cache: memoryCache() });
    for (const [url] of f.mock.calls) {
      expect(url).not.toMatch(/apikey|key=|ip=|device/i);
    }
  });

  it("geocodes once and keeps the forecast for an hour", async () => {
    let t = 0;
    const cache = memoryCache(() => t);
    const f = fetcher();
    await weatherFor("Kyiv", { fetcher: f, cache });
    await weatherFor("Kyiv", { fetcher: f, cache });
    expect(f).toHaveBeenCalledTimes(2); // one geocode, one forecast
    t = FORECAST_TTL_MS + 1;
    await weatherFor("Kyiv", { fetcher: f, cache });
    // forecast asked again, the city was not looked up again
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[2]?.[0]).toContain("api.open-meteo.com/v1/forecast");
  });

  it("is null with no city, an unknown city, or the service down", async () => {
    const f = fetcher();
    expect(
      await weatherFor("   ", { fetcher: f, cache: memoryCache() })
    ).toBeNull();
    expect(f).not.toHaveBeenCalled();

    const none = jest.fn(() => json({}));
    expect(
      await weatherFor("Nowhereville", { fetcher: none, cache: memoryCache() })
    ).toBeNull();

    const down = jest.fn(() => json({}, false));
    expect(
      await weatherFor("Kyiv", { fetcher: down, cache: memoryCache() })
    ).toBeNull();
  });
});

describe("searchCities", () => {
  const GEO_LIST = {
    results: [
      {
        name: "Zürich",
        admin1: "Zurich",
        country: "Switzerland",
        country_code: "ch",
        latitude: 47.37,
        longitude: 8.55,
      },
      {
        name: "Zürich",
        admin1: "Zurich",
        country: "Switzerland",
        country_code: "CH",
        latitude: 47.371,
        longitude: 8.551,
      },
      { name: "Nowhere", latitude: "x", longitude: 1 },
    ],
  };

  it("asks for eight places, returns usable ones once, and sends only the query", async () => {
    const f = jest.fn((url: string) => json(url ? GEO_LIST : null));
    const found = await searchCities("  zur ", {
      fetcher: f,
      cache: memoryCache(),
    });
    expect(found).toEqual([
      {
        name: "Zürich",
        admin1: "Zurich",
        country: "Switzerland",
        countryCode: "CH",
        latitude: 47.37,
        longitude: 8.55,
      },
    ]);
    const url = f.mock.calls[0][0];
    expect(url).toContain("name=zur");
    expect(url).toContain("count=8");
    expect(url).not.toMatch(/apikey|key=|ip=|device/i);
  });

  it("asks nobody under two letters, and remembers an answer", async () => {
    const f = jest.fn((url: string) => json(url ? GEO_LIST : null));
    const cache = memoryCache();
    expect(await searchCities("z", { fetcher: f, cache })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    await searchCities("Zur", { fetcher: f, cache });
    await searchCities("zur", { fetcher: f, cache });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("weatherFor with a picked place", () => {
  it("uses its coordinates and does not geocode", async () => {
    const f = fetcher();
    const w = await weatherFor("Zürich", {
      fetcher: f,
      cache: memoryCache(),
      place: {
        name: "Zürich",
        admin1: null,
        country: "Switzerland",
        countryCode: "CH",
        latitude: 47.37,
        longitude: 8.55,
      },
    });
    expect(w?.city).toBe("Zürich");
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain("api.open-meteo.com/v1/forecast");
    expect(f.mock.calls[0][0]).toContain("latitude=47.37");
  });
});

describe("the words", () => {
  it("names the codes", () => {
    expect(describeWeather(0)).toBe("Clear");
    expect(describeWeather(63)).toBe("Rain");
    expect(describeWeather(95)).toBe("Thunderstorm");
  });
  it("tidies a typed city", () => {
    expect(cleanCity("  New   York ")).toBe("New York");
    expect(cleanCity(42)).toBe("");
    expect(cleanCity("x".repeat(200))).toHaveLength(80);
  });
});

describe("weatherFor detail", () => {
  it("reads feels-like, rain chance, wind, sun and the next hours", async () => {
    const rich = {
      current: {
        time: "2026-10-27T14:00",
        temperature_2m: 13.6,
        apparent_temperature: 11.4,
        wind_speed_10m: 14.2,
        weather_code: 2,
      },
      daily: {
        temperature_2m_max: [17.2],
        temperature_2m_min: [8.8],
        sunrise: ["2026-10-27T07:12"],
        sunset: ["2026-10-27T17:31"],
        precipitation_probability_max: [40],
      },
      hourly: {
        time: [
          "2026-10-27T13:00",
          "2026-10-27T14:00",
          "2026-10-27T15:00",
          "2026-10-27T16:00",
          "2026-10-27T17:00",
          "2026-10-27T18:00",
          "2026-10-27T19:00",
        ],
        temperature_2m: [13, 14, 15, 14, 12, 11, 10],
        weather_code: [2, 2, 3, 61, 61, 3, 0],
        precipitation_probability: [0, 5, 10, 60, 70, 20, 0],
      },
    };
    const f = jest.fn((url: string) =>
      url.includes("geocoding") ? json(GEO) : json(rich)
    );
    const w = await weatherFor("Kyiv", { fetcher: f, cache: memoryCache() });
    expect(w).toMatchObject({
      feelsLike: 11,
      precipChance: 40,
      windKph: 14,
      sunrise: "07:12",
      sunset: "17:31",
    });
    expect(w?.hours.map((h) => h.time)).toEqual([
      "15:00",
      "16:00",
      "17:00",
      "18:00",
    ]);
    expect(w?.hours[1]).toEqual({
      time: "16:00",
      temp: 14,
      code: 61,
      precipChance: 60,
    });
  });
});
