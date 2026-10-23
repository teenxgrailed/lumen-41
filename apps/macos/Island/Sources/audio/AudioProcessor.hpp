/* Real-time audio processor using Accelerate framework for efficient RMS and biquad filtering. */

#ifndef AUDIOPROCESSOR_HPP
#define AUDIOPROCESSOR_HPP

#include <Accelerate/Accelerate.h>
#include <atomic>

class AudioProcessor {
   private:
    static constexpr int kBlockSize = 512;
    static constexpr int kBands = 6;
    static constexpr float kAttack = 0.85f;   // fast rise
    static constexpr float kRelease = 0.40f;  // slower fall — more musical
    static constexpr float kGains[kBands] = { 3.0f, 4.5f, 6.0f, 9.0f, 14.0f, 24.0f };

    float sampleRate;
    int writePos = 0;
    float mono[kBlockSize] = {};
    float filtered[kBlockSize] = {};

    vDSP_biquad_Setup setups[kBands];
    alignas( 16 ) float delays[kBands][4] = {};

    float envelopes[kBands] = {};

    // Lock-free: audio thread writes, render thread reads
    // One atomic per band — fits in a cache line
    alignas( 64 ) std::atomic< float > bandParams[kBands] = {};

   public:
    explicit AudioProcessor( float sr = 48000.0f );
    ~AudioProcessor();

    // Called by CoreAudio — must be real-time safe (no alloc, no locks)
    void process( const float* __restrict__ buffer, int totalSamples );

    // Called by render thread — lock-free read
    float getBand( int i ) const;
    int getBandCount() const { return kBands; }

   private:
    enum class FilterType { LowPass, BandPass, HighPass };

    void processBlock();
    void setupBiquad( int idx, FilterType type, float freq, float q );
};

#endif  // AUDIOPROCESSOR_HPP
