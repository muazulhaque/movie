'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMobileDetect, getYear } from '@/lib/utils';
import MovieService from '@/services/MovieService';
import { useModalStore } from '@/stores/modal';
import {
  type KeyWord,
  MediaType,
  type Genre,
  type ShowWithGenreAndVideo,
  type VideoResult,
} from '@/types';
import Link from 'next/link';
import * as React from 'react';
import Youtube from 'react-youtube';
import CustomImage from './custom-image';

type YouTubePlayer = {
  mute: () => void;
  unMute: () => void;
  playVideo: () => void;
  seekTo: (value: number) => void;
  container: HTMLDivElement;
  internalPlayer: YouTubePlayer;
};

type YouTubeEvent = {
  target: YouTubePlayer;
};

const userAgent =
  typeof navigator === 'undefined' ? 'SSR' : navigator.userAgent;
const { isMobile } = getMobileDetect(userAgent);
const defaultOptions: Record<string, object> = {
  playerVars: {
    // https://developers.google.com/youtube/player_parameters
    rel: 0,
    mute: isMobile() ? 1 : 0,
    loop: 1,
    autoplay: 1,
    controls: 0,
    showinfo: 0,
    disablekb: 1,
    enablejsapi: 1,
    playsinline: 1,
    cc_load_policy: 0,
    modestbranding: 3,
  },
};

const ShowModal = () => {
  // stores
  const modalStore = useModalStore();
  const IS_MOBILE: boolean = isMobile();

  const [trailer, setTrailer] = React.useState('');
  const [isPlaying, setPlaying] = React.useState(true);
  const [genres, setGenres] = React.useState<Genre[]>([]);
  const [isAnime, setIsAnime] = React.useState<boolean>(false);
  const [isMuted, setIsMuted] = React.useState<boolean>( modalStore.firstLoad || IS_MOBILE, );
  const [options, setOptions] = React.useState<Record<string, object>>(defaultOptions);
  const youtubeRef = React.useRef(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [contentRating, setContentRating] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchContentRating = async () => {
      if (!modalStore.show?.id) return;
      try {
        const isTv = modalStore.show.media_type === MediaType.TV;
        if (isTv) {
          const { data }: any = await MovieService.getContentRating('tv', modalStore.show.id);
          const results: any[] = data?.results ?? [];
          const prefOrder = ['RU','UA', 'LV', 'TW'];
          let rating: string | null = null;
          for (const cc of prefOrder) {
            const match = results.find((r: any) => r?.iso_3166_1 === cc);
            const candidate = match?.rating ?? match?.certification ?? '';
            if (candidate && String(candidate).trim().length > 0) {
              rating = String(candidate).trim();
              break;
            }
          }
          if (!rating) {
            const firstNonEmpty = results.find((r: any) => (r?.rating ?? r?.certification ?? '').toString().trim().length > 0);
            rating = firstNonEmpty ? String(firstNonEmpty.rating ?? firstNonEmpty.certification).trim() : null;
          }
          setContentRating(rating);
          return;
        }
    
        // Movies use release_dates endpoint
        const { data }: any = await MovieService.getMovieReleaseDates(modalStore.show.id);
        const countries: any[] = data?.results ?? [];
        const prefOrder = ['RU','UA', 'LV', 'TW'];
        const getFirstNonEmpty = (c: any): string | null => {
          const arr = (c?.release_dates ?? [])
            .filter((rd: any) => rd && typeof rd.certification === 'string')
            .map((rd: any) => ({ cert: rd.certification?.trim?.() ?? '', date: rd.release_date }))
            .filter((x: any) => x.cert.length > 0)
            .sort((a: any, b: any) => (new Date(b.date).getTime()) - (new Date(a.date).getTime()));
          return arr.length ? arr[0].cert : null;
        };
        let cert: string | null = null;
        for (const cc of prefOrder) {
          const country = countries.find((c: any) => c?.iso_3166_1 === cc);
          cert = getFirstNonEmpty(country);
          if (cert) break;
        }
        if (!cert) {
          // fallback to first country with a non-empty certification
          for (const c of countries) {
            cert = getFirstNonEmpty(c);
            if (cert) break;
          }
        }
        setContentRating(cert);
      } catch (error) {
        console.error('Failed to fetch content rating:', error);
        setContentRating(null);
      }
    };
    fetchContentRating();
  }, [modalStore.show?.id, modalStore.show?.media_type]);

  // get trailer and genres of show
  React.useEffect(() => {
    if (modalStore.firstLoad || IS_MOBILE) {
      setOptions((state: Record<string, object>) => ({
        ...state,
        playerVars: { ...state.playerVars, mute: 1 },
      }));
    }
    void handleGetData();
  }, []);

  React.useEffect(() => {
    setIsAnime(false);
  }, [modalStore]);

  const handleGetData = async () => {
    const id: number | undefined = modalStore.show?.id;
    const type: string =
      modalStore.show?.media_type === MediaType.TV ? 'tv' : 'movie';
    if (!id || !type) {
      return;
    }
    // Try Hindi trailer first, fallback to English
    let data: ShowWithGenreAndVideo = await MovieService.findMovieByIdAndType(id, type, 'hi-IN');
    if (!data.videos?.results?.length) {
      data = await MovieService.findMovieByIdAndType(id, type, 'en-US');
    }

    const keywords: KeyWord[] =
      data?.keywords?.results || data?.keywords?.keywords;

    if (keywords?.length) {
      setIsAnime(
        !!keywords.find((keyword: KeyWord) => keyword.name === 'anime'),
      );
    }

    if (data?.genres) {
      setGenres(data.genres);
    }
    if (data.videos?.results?.length) {
      const videoData: VideoResult[] = data.videos?.results;
      const result: VideoResult | undefined = videoData.find(
        (item: VideoResult) => item.type === 'Trailer',
      );
      if (result?.key) setTrailer(result.key);
    }
  };

  const handleCloseModal = () => {
    modalStore.reset();
    if (!modalStore.show || modalStore.firstLoad) {
      window.history.pushState(null, '', '/home');
    } else {
      window.history.back();
    }
  };

  const onEnd = (event: YouTubeEvent) => {
    event.target.seekTo(0);
  };

  const onPlay = () => {
    if (imageRef.current) {
      imageRef.current.style.opacity = '0';
    }
    if (youtubeRef.current) {
      const iframeRef: HTMLElement | null =
        document.getElementById('video-trailer');
      if (iframeRef) iframeRef.classList.remove('opacity-0');
    }
  };

  const onReady = (event: YouTubeEvent) => {
    event.target.playVideo();
  };

  const handleChangeMute = () => {
    setIsMuted((state: boolean) => !state);
    if (!youtubeRef.current) return;
    const videoRef: YouTubePlayer = youtubeRef.current as YouTubePlayer;
    if (isMuted && youtubeRef.current) {
      videoRef.internalPlayer.unMute();
    } else if (youtubeRef.current) {
      videoRef.internalPlayer.mute();
    }
  };

  const handleHref = (): string => {
    const type = isAnime
      ? 'anime'
      : modalStore.show?.media_type === MediaType.MOVIE
        ? 'movie'
        : 'tv';
    let id = `${modalStore.show?.id}`;
    if (isAnime) {
      const prefix: string =
        modalStore.show?.media_type === MediaType.MOVIE ? 'm' : 't';
      id = `${prefix}-${id}`;
    }
    return `/watch/${type}/${id}`;
  };

  return (
    <Dialog
      open={modalStore.open}
      onOpenChange={handleCloseModal}
      aria-label="Modal containing show's details">
      <DialogContent
        className="w-full overflow-hidden rounded-md bg-neutral-900 p-0 text-left align-middle sm:max-w-3xl lg:max-w-4xl border-none"
      >
        <div className="relative aspect-video"
        // style={{
        //   background: 'linear-gradient(0deg, #181818, transparent 100%)',
        //   opacity: 1,
        //   paddingBottom: 'calc(var(--spacing) * 1)'
        // }}
        >
          <CustomImage
            fill
            priority
            ref={imageRef}
            alt={modalStore?.show?.title ?? 'poster'}
            className="z-1 h-auto w-full object-cover"
            src={`https://image.tmdb.org/t/p/original${
              modalStore.show?.backdrop_path ?? modalStore.show?.poster_path
            }`}
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 100vw, 33vw"
          />
          {trailer && (
            <Youtube
              opts={options}
              onEnd={onEnd}
              onPlay={onPlay}
              ref={youtubeRef}
              onReady={onReady}
              videoId={trailer}
              id="video-trailer"
              title={
                modalStore.show?.title ??
                modalStore.show?.name ??
                'video-trailer'
              }
              className="relative aspect-video w-full"
              style={{ width: '100%', height: '100%' }}
              iframeClassName={`relative pointer-events-none w-[100%] h-[100%] z-[-10] opacity-0`}
            />
          )}

          <div className='absolute bottom-[-5px] z-10 w-full h-full mask-t-from-9% mask-t-to-50% bg-neutral-900'></div>
          
          <div className="absolute bottom-6 z-20 flex w-full items-center justify-between gap-2 px-10">
            <div className="flex items-center gap-2.5">
              <Link href={handleHref()}>
                <Button
                  aria-label={`${isPlaying ? 'Pause' : 'Play'} show`}
                  className="group h-auto rounded-[9px] py-1.5 bg-neutral-50 text-black hover:bg-neutral-300">
                  <>
                    <Icons.play
                      className="mr-1.5 h-6 w-6 fill-current"
                      aria-hidden="true"
                    />
                    Play
                  </>
                </Button>
              </Link>
            </div>
            <button
              aria-label={`${isMuted ? 'Unmute' : 'Mute'} video`}
              // variant="ghost"
              className="rounded-full p-1 ring-2 bg-transparent backdrop-blur-md hover:text-white ring-neutral-100/40 hover:ring-white text-neutral-300/40 transition duration-500 hover:cursor-pointer"
              onClick={handleChangeMute}>
              {isMuted ? (
                <Icons.volumeMute className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Icons.volume className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>

        </div>
        <div className="grid gap-2.5 px-10 pb-10">
          <DialogTitle className="text-lg leading-6 font-medium text-slate-50 sm:text-xl">
            {modalStore.show?.title ?? modalStore.show?.name}
          </DialogTitle>
          <div className="flex items-center space-x-2 text-sm sm:text-base">
            <p className="font-semibold text-green-400">
              {Math.round((Number(modalStore.show?.vote_average) / 10) * 100) ??
                '-'}
              % Match
            </p>
            {modalStore.show?.release_date ? (
              <p className='text-slate-50'>{getYear(modalStore.show?.release_date)}</p>
            ) : modalStore.show?.first_air_date ? (
              <p className='text-slate-50'>{getYear(modalStore.show?.first_air_date)}</p>
            ) : null}
            {modalStore.show?.original_language && (
              <span className="grid h-4 w-7 place-items-center text-xs font-bold text-neutral-400 ring-1 ring-neutral-400">
                {modalStore.show.original_language.toUpperCase()}
              </span>
            )}
              <span className="grid h-4 w-7 place-items-center text-xs font-bold text-neutral-400 ring-1 ring-neutral-400">
               {contentRating ?? 'NA'}
              </span>
          </div>
          <DialogDescription className="line-clamp-3 text-xs text-slate-50 sm:text-sm">
            {modalStore.show?.overview ?? '-'}
          </DialogDescription>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-neutral-400">
            <span className="text-neutral-50">Genres:</span>
            {genres.map((genre) => genre.name).join(', ')}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShowModal;
